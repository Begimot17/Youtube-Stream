import os
import subprocess
import sys
import whisper  # Библиотека от OpenAI

# --- Конфигурация ---
# Директории
CWD = os.getcwd()
AUDIO_DIR = os.path.join(CWD, 'audio')
TEXT_OUTPUT_DIR = os.path.join(CWD, 'text_output')  # Папка для сохранения текстов

# Настройки Whisper
# Доступные модели: tiny, base, small, medium, large.
# 'base' - хороший баланс скорости и качества для начала.
# Для максимальной точности используйте 'medium' или 'large', но они требуют больше ресурсов.
MODEL_NAME = "base"

# Поддерживаемые расширения аудио
SUPPORTED_EXTENSIONS = ('.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac')


# --- Конец конфигурации ---

def check_ffmpeg():
    """Проверяет, установлен ли ffmpeg и доступен ли он в системном PATH."""
    try:
        # Скрываем вывод команды, если она успешна
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, text=True)
        return True
    except FileNotFoundError:
        print("ОШИБКА: ffmpeg не найден.")
        print("Пожалуйста, установите FFmpeg (https://ffmpeg.org/download.html) и убедитесь, что он добавлен в системный PATH.")
        return False
    except subprocess.CalledProcessError as e:
        print(f"ОШИБКА: ffmpeg установлен, но вернул ошибку: {e.stderr}")
        return False


def main():
    """Основная функция для запуска процесса транскрибации."""
    if not check_ffmpeg():
        sys.exit(1)

    # Проверяем наличие папки с аудио
    if not os.path.isdir(AUDIO_DIR):
        print(f"ОШИБКА: Папка '{os.path.basename(AUDIO_DIR)}' не найдена. Создаю ее.")
        os.makedirs(AUDIO_DIR)
        print(f"Пожалуйста, поместите аудиофайлы в папку '{os.path.basename(AUDIO_DIR)}' и запустите скрипт снова.")
        sys.exit(1)

    # Создаем папку для вывода текстов, если ее нет
    os.makedirs(TEXT_OUTPUT_DIR, exist_ok=True)

    audio_files = [f for f in os.listdir(AUDIO_DIR) if f.lower().endswith(SUPPORTED_EXTENSIONS)]

    if not audio_files:
        print(f"В папке '{os.path.basename(AUDIO_DIR)}' не найдено аудиофайлов с расширениями: {', '.join(SUPPORTED_EXTENSIONS)}")
        return

    print(f"Найдено {len(audio_files)} аудиофайлов для обработки.")
    print(f"Загружаю модель Whisper '{MODEL_NAME}'... (Это может занять некоторое время при первом запуске)")

    try:
        model = whisper.load_model(MODEL_NAME)
        print("Модель успешно загружена.")
    except Exception as e:
        print(f"Не удалось загрузить модель Whisper: {e}")
        print("Убедитесь, что у вас есть интернет-соединение для скачивания модели при первом запуске.")
        sys.exit(1)

    for filename in audio_files:
        audio_path = os.path.join(AUDIO_DIR, filename)
        output_filename = f"{os.path.splitext(filename)[0]}.txt"
        output_path = os.path.join(TEXT_OUTPUT_DIR, output_filename)

        print(f"\n[->] Начинаю транскрибацию файла: {filename}")

        try:
            # Выполняем транскрибацию
            result = model.transcribe(audio_path, fp16=False)  # fp16=False для лучшей совместимости с CPU
            transcribed_text = result["text"]

            # Сохраняем результат в текстовый файл
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(transcribed_text)

            print(f"[OK] Текст сохранен в: {output_filename}")

        except Exception as e:
            print(f"[!!] Ошибка при обработке файла {filename}: {e}")

    print("\nТранскрибация завершена. Все тексты находятся в папке 'text_output'.")


if __name__ == "__main__":
    main()