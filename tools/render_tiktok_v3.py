from pathlib import Path
import subprocess

import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "tiktok"
BACKGROUND = OUTPUT / "tennis-data-background.png"
NARRATION = OUTPUT / "lektor-v2.mp3"
SUBTITLES = OUTPUT / "napisy-v3.ass"
VIDEO = OUTPUT / "pointedge-tenis-3-sygnaly-premium.mp4"


def ffmpeg_filter_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


def main() -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subtitle_path = ffmpeg_filter_path(SUBTITLES)
    fonts_path = "C\\:/Windows/Fonts"
    video_filter = (
        "scale=1280:2276,"
        "zoompan="
        "z='1.025+0.035*(0.5+0.5*sin(on/180))':"
        "x='iw/2-(iw/zoom/2)+25*sin(on/46)':"
        "y='ih/2-(ih/zoom/2)+17*cos(on/59)':"
        "d=1:s=1080x1920:fps=30,"
        "eq=brightness=-0.045:contrast=1.10:saturation=1.20,"
        "vignette=PI/5.5,"
        "drawbox="
        "x='mod(t*260,1500)-320':y=0:w=150:h=1920:"
        "color=0x00d9ff@0.035:t=fill,"
        "drawbox=x=120:y=225:w=840:h=3:color=0xffffff@0.16:t=fill,"
        "drawbox=x=120:y=225:"
        "w='min(t/61.2*840,840)':h=3:color=0x00d9ff@0.95:t=fill,"
        "drawbox=color=0x00d9ff@0.14:t=fill:"
        "enable='between(t,9.08,9.25)+between(t,23.35,23.52)+"
        "between(t,38.45,38.62)+between(t,52.83,53.02)',"
        f"subtitles='{subtitle_path}':fontsdir='{fonts_path}',"
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
