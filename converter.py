import os
import subprocess
import sys

CWD = os.getcwd()
AUDIO_DIR = os.path.join(CWD, 'audio_6')
ASSETS_DIR = os.path.join(CWD, 'assets')
ASSETS_2_DIR = os.path.join(CWD, 'assets_6')
OUTPUT_DIR = os.path.join(CWD, 'output_6')

TITLE = 'А в Дискорде тепло'
AUDIO_FILE = os.path.join(AUDIO_DIR, f'{TITLE}.mp3')
BACKGROUND_FILE = os.path.join(ASSETS_2_DIR, f'{TITLE}.png')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, f'{TITLE}.mp4')
FONT_FILE = os.path.join(ASSETS_DIR, 'Remains(RUS BY LYAJKA) Regular.ttf')
# ARTIST = 'Bavos Ububu'
ARTIST = 'Никита'
FONT_SIZE = 98

SUPPORTED_EXTENSIONS = ('.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac')
SUPPORTED_IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.webp')

def check_ffmpeg():
    print("Текущий PATH, который видит скрипт:")
    print(os.environ.get('PATH'))
    try:
        # Используем capture_output=True чтобы скрыть вывод команд
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        subprocess.run(['ffprobe', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("\nОШИБКА: ffmpeg или ffprobe не найдены.")
        print(
            "Пожалуйста, установите FFmpeg (https://ffmpeg.org/download.html) и убедитесь, что он добавлен в системный PATH.")
        print("Если вы уже добавили FFmpeg в PATH, попробуйте перезапустить PyCharm, чтобы он увидел изменения.")
        return False


def get_audio_duration(file_path):
    command = [
        'ffprobe',
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        file_path
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True, encoding='utf-8')
        return float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError) as e:
        print(f"Не удалось получить длительность для файла {os.path.basename(file_path)}: {e}")
        return None


def escape_ffmpeg_path(path):
    return path.replace('\\', '/').replace(':', '\\:')


def escape_drawtext_text(text):
    return text.replace('\\', '\\\\').replace("'", r"\'").replace('%', r'\%').replace(':', r'\:')


def create_video_from_audio():
    print(f"Начинаю обработку: {os.path.basename(OUTPUT_FILE)}")

    duration = get_audio_duration(AUDIO_FILE)
    if duration is None:
        return

    background_ext = os.path.splitext(BACKGROUND_FILE)[1].lower()
    if background_ext in SUPPORTED_IMAGE_EXTENSIONS:
        background_input_opts = ['-loop', '1', '-framerate', '25', '-i', BACKGROUND_FILE]
    else:
        background_input_opts = ['-stream_loop', '-1', '-i', BACKGROUND_FILE]

    audio_fade_duration = min(3, duration / 2)

    escaped_artist = escape_drawtext_text(ARTIST)
    escaped_title = escape_drawtext_text(TITLE)

    font_path_abs = os.path.abspath(FONT_FILE)
    if not os.path.exists(font_path_abs):
        print(f"ОШИБКА: Файл шрифта не найден: {font_path_abs}")
        print("Пожалуйста, убедитесь, что шрифт находится в папке 'assets'.")
        return
    escaped_font_path = escape_ffmpeg_path(font_path_abs)

    artist_y = f"(h*3/4)-{FONT_SIZE}"
    title_y = "(h*3/4)"

    text_vf = (
        f"drawtext=fontfile='{escaped_font_path}':text='{escaped_artist}':fontcolor=white:fontsize={FONT_SIZE}:x=(w-text_w)/2:y={artist_y},"
        f"drawtext=fontfile='{escaped_font_path}':text='{escaped_title}':fontcolor=white:fontsize={FONT_SIZE}:x=(w-text_w)/2:y={title_y}"
    )
    af_filter = f"afade=t=in:st=0:d={audio_fade_duration},afade=t=out:st={duration - audio_fade_duration}:d={audio_fade_duration}"
    filter_complex = f"[0:v]scale=1920:1080,format=yuv420p,{text_vf}[v];[1:a]{af_filter}[a]"

    command = [
        'ffmpeg',
        '-y',  # Перезаписывать выходной файл, если он существует
        *background_input_opts, # Опции для фона
        '-i', AUDIO_FILE,       # Аудиофайл
        '-filter_complex', filter_complex,
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'fast',  # Хороший баланс скорости и качества
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',  # Закончить кодирование, когда закончится самый короткий поток (аудио)
        OUTPUT_FILE
    ]

    print(f"Создаю видео: {OUTPUT_FILE}...")
    try:
        subprocess.run(command, capture_output=True, text=True, check=True, encoding='utf-8')
        print(f"Успешно создано: {OUTPUT_FILE}")
    except subprocess.CalledProcessError as e:
        print(f"Ошибка при создании видео для {os.path.basename(AUDIO_FILE)}.")
        print(f"ffmpeg stderr: {e.stderr}")


def main():
    if not check_ffmpeg():
        sys.exit(1)

    if not os.path.exists(BACKGROUND_FILE):
        print(f"ОШИБКА: Файл фона не найден: {BACKGROUND_FILE}")
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    create_video_from_audio()

    print("\nКонвертация завершена. Все видео находятся в папке 'output'.")


if __name__ == "__main__":
    main()