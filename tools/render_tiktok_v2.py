from pathlib import Path
import subprocess

import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "tiktok"
BACKGROUND = OUTPUT / "tennis-data-background.png"
NARRATION = OUTPUT / "lektor-v2.mp3"
SUBTITLES = OUTPUT / "napisy-v2.ass"
VIDEO = OUTPUT / "pointedge-tenis-3-sygnaly.mp4"


def ffmpeg_filter_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


def main() -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subtitle_path = ffmpeg_filter_path(SUBTITLES)
    video_filter = (
        "scale=1240:2205,"
        "zoompan="
        "z='min(zoom+0.00016,1.075)':"
        "x='iw/2-(iw/zoom/2)+16*sin(on/42)':"
        "y='ih/2-(ih/zoom/2)+11*cos(on/55)':"
        "d=1:s=1080x1920:fps=30,"
        "eq=brightness=-0.055:contrast=1.06:saturation=1.14,"
        "vignette=PI/5,"
        "drawbox="
        "x='mod(t*185,1400)-260':y=0:w=115:h=1920:"
        "color=0x00d9ff@0.025:t=fill,"
        "drawbox=x=120:y=225:w=840:h=4:color=0xffffff@0.18:t=fill,"
        "drawbox=x=120:y=225:"
        "w='min(t/61.2*840,840)':h=4:color=0x00d9ff@0.95:t=fill,"
        "drawbox=color=0x00d9ff@0.07:t=fill:"
        "enable='between(t,9.05,9.23)+between(t,23.32,23.50)+"
        "between(t,38.42,38.60)+between(t,52.80,53.00)',"
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
        "18",
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
