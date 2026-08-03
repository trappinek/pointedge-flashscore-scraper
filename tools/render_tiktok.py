from pathlib import Path
import subprocess

import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "tiktok"
BACKGROUND = OUTPUT / "tennis-data-background.png"
NARRATION = OUTPUT / "lektor.mp3"
SUBTITLES = OUTPUT / "napisy.ass"
VIDEO = OUTPUT / "pointedge-ciekawostki-tenis.mp4"


def ffmpeg_filter_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


def main() -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subtitle_path = ffmpeg_filter_path(SUBTITLES)
    video_filter = (
        "scale=1200:2134,"
        "zoompan=z='min(zoom+0.00022,1.08)':"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        "d=1:s=1080x1920:fps=30,"
        "eq=brightness=-0.035:saturation=1.10,"
        f"subtitles='{subtitle_path}',"
        "format=yuv420p"
    )

    command = [
        ffmpeg,
        "-y",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-i",
        str(BACKGROUND),
        "-i",
        str(NARRATION),
        "-vf",
        video_filter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "19",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(VIDEO),
    ]
    subprocess.run(command, check=True)
    print(VIDEO)


if __name__ == "__main__":
    main()
