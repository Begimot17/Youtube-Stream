import express from 'express'
import { spawn } from 'child_process'
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const server = express()
const audioDir = './audio';
const publicDir = path.resolve(process.cwd(), 'public');
server.use(express.json());

const streamkey = process.env.streamkey
const video = "assets/background_720p.mp4";
const fontpath = process.env.fontpath;

function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);

        let duration = '';
        ffprobe.stdout.on('data', (data) => {
            duration += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            console.error(`ffprobe stderr: ${data}`);
            reject(data.toString());
        });

        ffprobe.on('close', (code) => {
            if (code === 0) {
                const parsedDuration = parseFloat(duration);
                if (isNaN(parsedDuration)) {
                    reject('Could not parse duration from ffprobe output.');
                } else {
                    resolve(parsedDuration);
                }
            } else {
                reject(`ffprobe process exited with code ${code}`);
            }
        });
    });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

let videoInfo = {};
let audioFilesWithDurations = [];
let currentSong = null;
let child = null;
let sseClients = [];

function sendToAllClients(data) {
    sseClients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}\n\n`));
}

function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const seconds = parts[2] ? parseFloat(parts[2]) : 0;
    const minutes = parts[1] ? parseInt(parts[1], 10) * 60 : 0;
    const hours = parts[0] ? parseInt(parts[0], 10) * 3600 : 0;
    return hours + minutes + seconds;
}

async function getVideoInfo(filePath) {
    console.log("Getting video info...");
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'stream=duration,r_frame_rate',
            '-of', 'default=noprint_wrappers=1',
            filePath
        ]);

        let info = '';
        ffprobe.stdout.on('data', (data) => {
            info += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (code === 0) {
                const durationMatch = info.match(/duration=([0-9.]+)/);
                const frameRateMatch = info.match(/r_frame_rate=([0-9]+)\/([0-9]+)/);
                if (durationMatch && frameRateMatch) {
                    const duration = parseFloat(durationMatch[1]);
                    const frameRate = parseInt(frameRateMatch[1], 10) / parseInt(frameRateMatch[2], 10);
                    const frames = Math.floor(duration * frameRate);
                    console.log(`Video info: ${duration}s, ${frameRate}fps, ${frames} frames.`);
                    resolve({ frames, frameRate });
                } else {
                    reject('Could not parse video info from ffprobe output.');
                }
            } else {
                reject(`ffprobe process exited with code ${code}`);
            }
        });
    });
}

async function populateInitialSongList() {
    console.log("Populating initial song list...");
    const files = await fs.promises.readdir(audioDir);
    const audioFiles = files.filter(file => path.extname(file).toLowerCase() === '.mp3');
    
    for (const file of audioFiles) {
        try {
            const filePath = path.resolve(audioDir, file);
            const duration = await getAudioDuration(filePath);
            audioFilesWithDurations.push({ path: filePath, name: file, duration: duration });
        } catch (error) {
            console.error(`Could not get duration for ${file}. Skipping.`, error);
        }
    }
    console.log(`Finished populating song list. Found ${audioFilesWithDurations.length} songs.`);
}

async function checkForNewSongs() {
    // console.log("Checking for new audio files...");
    const files = await fs.promises.readdir(audioDir);
    const onDiskSongNames = files.filter(file => path.extname(file).toLowerCase() === '.mp3');

    const inMemorySongNames = new Set(audioFilesWithDurations.map(s => s.name));
    const newSongFiles = onDiskSongNames.filter(name => !inMemorySongNames.has(name));

    if (newSongFiles.length > 0) {
        console.log(`Found ${newSongFiles.length} new songs. Adding to the end of the queue...`);
        for (const file of newSongFiles) {
            try {
                const filePath = path.resolve(audioDir, file);
                const duration = await getAudioDuration(filePath);
                audioFilesWithDurations.push({ path: filePath, name: file, duration: duration });
                console.log(`Added new song: ${file}`);
            } catch (error) {
                console.error(`Could not get duration for new file ${file}. Skipping.`, error);
            }
        }
    }
}

async function playNextSong() {
    console.log(`[${new Date().toISOString()}] --- Starting playNextSong ---`);
    if (audioFilesWithDurations.length === 0) {
        console.log("No audio files in queue. Waiting or retrying...");
        setTimeout(playNextSong, 10000);
        return;
    }

    try {
        const songToPlay = audioFilesWithDurations[0];
        currentSong = songToPlay;
        const { path: audio, name: songFile, duration } = songToPlay;

        console.log(`[${new Date().toISOString()}] Selected song: ${songFile}`);
        sendToAllClients({ type: 'songChange', song: currentSong });

        const audioFadeDuration = Math.min(3, duration / 2);
        const artist = 'Никита';
        const title = path.basename(songFile, path.extname(songFile));
        const escapeText = (text) => text.replace(/[\\%':]/g, char => `\\\\\\\\'${char}`);
        const FONT_SIZE = 80;
        const artist_y = `(h*3/4)-${FONT_SIZE}`;
        const title_y = `(h*3/4)`;
        
        const text_vf = `drawtext=fontfile='${fontpath}':text='${escapeText(artist)}':fontcolor=white:fontsize=${FONT_SIZE}:x=(w-text_w)/2:y=${artist_y},drawtext=fontfile='${fontpath}':text='${escapeText(title)}':fontcolor=white:fontsize=${FONT_SIZE}:x=(w-text_w)/2:y=${title_y}`;
        const af_filter = `afade=t=in:st=0:d=${audioFadeDuration},afade=t=out:st=${duration - audioFadeDuration}:d=${audioFadeDuration}`;
        const filter_complex = `[0:v]loop=loop=-1:size=${videoInfo.frames}:start=0,${text_vf}[v];[1:a]${af_filter}[a]`;
        
        const ffmpegArgs = [
            '-re',
            '-i', video,
            '-re',
            '-i', audio,
            '-filter_complex', filter_complex,
            '-map', '[v]',
            '-map', '[a]',
            '-vcodec', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-r', '24',
            '-g', '48',
            '-preset', 'ultrafast',
            '-b:v', '3000k',
            '-maxrate', '3000k',
            '-bufsize', '6000k',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-t', String(duration),
            '-f', 'flv',
            `rtmp://a.rtmp.youtube.com/live2/${streamkey}`,
        ];

        child = spawn('ffmpeg', ffmpegArgs);
        console.log(`[${new Date().toISOString()}] Spawned ffmpeg for ${songFile}`);

        child.stdout.on('data', (data) => {
            // console.log(`stdout: ${data.toString()}`);
        });

        let stderrBuffer = '';
        child.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
            // FFMPEG uses carriage returns to create updating progress lines.
            const lines = stderrBuffer.split('\r');
            
            // The last element might be an incomplete line, so keep it for the next chunk.
            stderrBuffer = lines.pop(); 

            for (const line of lines) {
                const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                if (timeMatch) {
                    const currentTimeStr = timeMatch[1];
                    const currentTimeSec = timeToSeconds(currentTimeStr);
                    sendToAllClients({
                        type: 'progress',
                        currentTime: currentTimeSec,
                        totalDuration: duration
                    });
                }
            }
        });

        child.on('close', (code) => {
            console.log(`[${new Date().toISOString()}] ffmpeg process for ${songFile} exited with code ${code}.`);
            child = null;
            if (code !== 0 && code !== 255) {
                console.error(`[${new Date().toISOString()}] ffmpeg exited with error. Check logs above.`);
            }

            const finishedSongName = currentSong ? currentSong.name : null;
            currentSong = null;
            
            // Move the song that just played to the end of the queue
            if (finishedSongName && audioFilesWithDurations.length > 0) {
                const finishedSongIndex = audioFilesWithDurations.findIndex(s => s.name === finishedSongName);
                
                if (finishedSongIndex !== -1) {
                    const [finishedSong] = audioFilesWithDurations.splice(finishedSongIndex, 1);
                    audioFilesWithDurations.push(finishedSong);
                    console.log(`Moved ${finishedSong.name} to the end of the queue.`);
                } else {
                    console.warn(`Finished song ${finishedSongName} was not found in the queue. It might have been removed.`);
                }
            }
            
            playNextSong();
        });

        child.on('error', (err) => {
            console.error(`[${new Date().toISOString()}] Child process error: ${err}`);
            child = null;
            currentSong = null;
            playNextSong();
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in playNextSong:`, error);
        setTimeout(playNextSong, 10000);
    }
}

(async () => {
    if (!streamkey) {
        console.error("Stream key is not set. Please set the 'streamkey' environment variable.");
        process.exit(1);
    } else {
        videoInfo = await getVideoInfo(video);
        await populateInitialSongList();
        shuffleArray(audioFilesWithDurations);
        console.log("Initial song order has been shuffled.");
        // Periodically check for new songs to add to the queue
        setInterval(checkForNewSongs, 30000); // 30000ms = 30 seconds
        playNextSong();
    }
})();

server.use(express.static(publicDir));

server.get('/api/songs', (req, res) => {
    res.json(audioFilesWithDurations);
});

server.get('/api/now-playing', (req, res) => {
    if (currentSong) {
        res.json(currentSong);
    } else {
        res.status(204).send();
    }
});

server.post('/api/songs/order', (req, res) => {
    const newOrderNames = req.body;
    if (!Array.isArray(newOrderNames)) {
        return res.status(400).send({ message: 'Request body must be an array of song names.' });
    }

    const currentSongsMap = new Map(audioFilesWithDurations.map(s => [s.name, s]));
    const newAudioFiles = newOrderNames
        .map(name => currentSongsMap.get(name))
        .filter(Boolean); // Filter out any songs that might not exist anymore

    // Check for any songs that are in memory but were not in the request
    // This can happen if a new song was added by the background check
    // but the client who made the request didn't know about it yet.
    if (audioFilesWithDurations.length > newAudioFiles.length) {
        audioFilesWithDurations.forEach(existingSong => {
            if (!newOrderNames.includes(existingSong.name)) {
                newAudioFiles.push(existingSong); // Add it to the end
                console.log(`Kept a new song in the queue that the client didn't know about: ${existingSong.name}`);
            }
        });
    }

    audioFilesWithDurations = newAudioFiles;
    // console.log("Updated song order:", audioFilesWithDurations.map(s => s.name));
    res.status(200).send({ message: 'Order updated' });
});

server.post('/api/songs/shuffle', (req, res) => {
    shuffleArray(audioFilesWithDurations);
    console.log("Shuffled song order:", audioFilesWithDurations.map(s => s.name));
    res.status(200).json(audioFilesWithDurations);
});

server.get('/api/stream-status', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res: res
    };
    sseClients.push(newClient);
    console.log(`SSE client connected: ${clientId}`);
    
    // Send current status immediately on connection
    if (currentSong) {
        sendToAllClients({ type: 'songChange', song: currentSong });
    }

    req.on('close', () => {
        console.log(`SSE client disconnected: ${clientId}`);
        sseClients = sseClients.filter(client => client.id !== clientId);
    });
});

server.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

server.listen(3000, () => {
    console.log('Live stream is ready');
    console.log('Open http://localhost:3000 to see the song queue.');
});
