document.addEventListener('DOMContentLoaded', () => {
    const songList = document.getElementById('song-list');
    const shuffleButton = document.getElementById('shuffle-button');
    const nowPlayingContainer = document.getElementById('now-playing-container');
    const nowPlayingName = document.getElementById('now-playing-name');
    const nowPlayingTime = document.getElementById('now-playing-time');
    const nowPlayingProgress = document.getElementById('now-playing-progress');
    let nowPlaying = null;

    async function sendNewOrder(newOrder) {
        try {
            await fetch('/api/songs/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newOrder)
            });
        } catch (error) {
            console.error('Error updating song order:', error);
        }
    }

    new Sortable(songList, {
        animation: 150,
        ghostClass: 'bg-secondary',
        onEnd: (evt) => {
            const upcomingSongItems = Array.from(evt.from.children);
            const upcomingSongNames = upcomingSongItems.map(item => item.dataset.name);
            let newFullOrder = [];
            if (nowPlaying) {
                newFullOrder.push(nowPlaying.name);
            }
            newFullOrder.push(...upcomingSongNames);
            sendNewOrder(newFullOrder);
        }
    });

    function formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function renderNowPlaying(song) {
        if (song) {
            if (!nowPlaying || nowPlaying.name !== song.name) {
                nowPlayingName.textContent = song.name.replace('.mp3', '');
                nowPlayingProgress.style.width = '0%';
                nowPlayingTime.textContent = `0:00 / ${formatDuration(song.duration)}`;
            }
            nowPlayingContainer.style.display = 'block';
        } else {
            nowPlayingContainer.style.display = 'none';
        }
    }

    async function moveSong(songName, direction) {
        let songs;
        try {
            const response = await fetch('/api/songs');
            if (!response.ok) throw new Error('Failed to fetch songs for reordering');
            songs = await response.json();
        } catch (error) {
            console.error(error);
            return;
        }

        let newOrderNames = songs.map(s => s.name);
        const songToMoveIndex = newOrderNames.indexOf(songName);
        if (songToMoveIndex === -1) return;

        const [songToMove] = newOrderNames.splice(songToMoveIndex, 1);
        if (direction === 'top') {
            newOrderNames.unshift(songToMove);
        } else {
            newOrderNames.push(songToMove);
        }
        await sendNewOrder(newOrderNames);
        await updateQueue();
    }

    async function fetchSongs() {
        try {
            const response = await fetch('/api/songs');
            const songs = await response.json();
            songList.innerHTML = '';
            const upcomingSongs = songs.filter(song => !nowPlaying || song.name !== nowPlaying.name);
            upcomingSongs.forEach(song => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                li.dataset.name = song.name;

                const songNameSpan = document.createElement('span');
                songNameSpan.textContent = song.name.replace('.mp3', '');
                
                const rightSide = document.createElement('div');
                rightSide.className = 'd-flex align-items-center';

                const songDuration = document.createElement('span');
                songDuration.className = 'badge text-bg-secondary me-3';
                songDuration.textContent = formatDuration(song.duration);

                const btnGroup = document.createElement('div');
                btnGroup.className = 'btn-group';
                
                const upButton = document.createElement('button');
                upButton.className = 'btn btn-sm btn-outline-secondary';
                upButton.innerHTML = '<i class="bi bi-chevron-bar-up"></i>';
                upButton.title = 'Move to top';
                upButton.onclick = (e) => { e.stopPropagation(); moveSong(song.name, 'top'); };
                
                const downButton = document.createElement('button');
                downButton.className = 'btn btn-sm btn-outline-secondary';
                downButton.innerHTML = '<i class="bi bi-chevron-bar-down"></i>';
                downButton.title = 'Move to bottom';
                downButton.onclick = (e) => { e.stopPropagation(); moveSong(song.name, 'bottom'); };
                
                btnGroup.appendChild(upButton);
                btnGroup.appendChild(downButton);
                
                rightSide.appendChild(songDuration);
                rightSide.appendChild(btnGroup);
                
                li.appendChild(songNameSpan);
                li.appendChild(rightSide);
                songList.appendChild(li);
            });
        } catch (error) {
            console.error('Error fetching songs:', error);
        }
    }

    async function fetchNowPlaying() {
        try {
            const response = await fetch('/api/now-playing');
            if (response.ok) {
                const song = await response.json();
                nowPlaying = song;
            } else {
                nowPlaying = null;
            }
        } catch (error) {
            console.error('Error fetching now playing:', error);
            nowPlaying = null;
        }
        renderNowPlaying(nowPlaying);
    }

    async function handleShuffle() {
        try {
            await fetch('/api/songs/shuffle', { method: 'POST' });
            await updateQueue();
        } catch (error) {
            console.error('Error shuffling songs:', error);
        }
    }

    shuffleButton.addEventListener('click', handleShuffle);

    async function updateQueue() {
        let songFromServer = null;
        try {
            const response = await fetch('/api/now-playing');
            if (response.ok) songFromServer = await response.json();
        } catch (error) { console.error('Error fetching now playing status:', error); }
        
        renderNowPlaying(songFromServer);
        nowPlaying = songFromServer;
        await fetchSongs();
    }

    // --- SSE Connection for Real-Time Progress ---
    const evtSource = new EventSource('/api/stream-status');

    evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'songChange') {
            renderNowPlaying(data.song);
            nowPlaying = data.song;
            fetchSongs();
        }

        if (data.type === 'progress') {
            const { currentTime, totalDuration } = data;
            if (nowPlaying && totalDuration > 0) {
                const percentage = (currentTime / totalDuration) * 100;
                nowPlayingProgress.style.width = `${percentage}%`;
                nowPlayingTime.textContent = `${formatDuration(currentTime)} / ${formatDuration(totalDuration)}`;
            }
        }
    };

    evtSource.onerror = (err) => {
        console.error("EventSource failed:", err);
    };
    
    updateQueue();
    setInterval(updateQueue, 5000); // We still keep this for robustness
}); 