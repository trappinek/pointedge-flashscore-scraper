from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "output" / "pointedge-promo"
WORK = ROOT / "output" / "pointedge-promo-v3"
AUDIO = Path(
    r"C:\Users\dcxml\Downloads\ElevenLabs_2026-07-30T02_35_26_Rafał - Shorts _pvc_sp100_s45_sb80_se2_b_m2.mp3"
)
BASE_VIDEO = WORK / "camera-master.mp4"
FINAL_VIDEO = WORK / "pointedge-czym-jest-final-v3.mp4"
ASS_FILE = WORK / "captions-v3.ass"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS = 1080, 1920, 30
TOTAL = 52.66
VIRTUAL_W, VIRTUAL_H = 1280, 2276
SCREEN_Y = (VIRTUAL_H - 720) // 2
FONT = Path(r"C:\Windows\Fonts\bahnschrift.ttf")


@dataclass(frozen=True)
class Scene:
    start: float
    end: float
    screenshot: str
    target_x: int
    target_y: int
    target_width: int
    label: str
    blur: tuple[tuple[int, int, int, int], ...] = ()


SCENES = [
    Scene(0.00, 4.90, "01-home.png", 640, 265, 590, "POINTEDGE"),
    Scene(4.90, 9.90, "01-home.png", 555, 455, 560, "NAJWAŻNIEJSZE INFORMACJE", ((720, 250, 1220, 710),)),
    Scene(9.90, 16.75, "04-analysis.png", 755, 430, 560, "KONTEKST MECZU", ((320, 170, 1220, 710),)),
    Scene(16.75, 20.45, "04-analysis.png", 770, 470, 520, "CZYTELNA ANALIZA", ((300, 150, 1230, 715),)),
    Scene(20.45, 24.65, "03-matches.png", 680, 390, 600, "MECZE ATP / WTA"),
    Scene(24.65, 28.95, "04-analysis.png", 670, 325, 540, "ARGUMENTY I DANE", ((290, 155, 1235, 715),)),
    Scene(28.95, 34.95, "05-stats.png", 730, 390, 600, "PUBLICZNA HISTORIA"),
    Scene(34.95, 38.15, "05-stats.png", 735, 490, 530, "SPRAWDŹ JAKOŚĆ"),
    Scene(38.15, 42.95, "02-method.png", 820, 235, 590, "ANALIZA CO 72 GODZINY", ((70, 65, 800, 210),)),
    Scene(42.95, 47.45, "06-reviews.png", 690, 395, 600, "MNIEJ SZUMU. WIĘCEJ KONTEKSTU."),
    Scene(47.45, TOTAL, "01-home.png", 640, 300, 560, "POINTEDGE.PL", ((710, 240, 1230, 715),)),
]


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def load_screen(scene: Scene) -> Image.Image:
    image = Image.open(SRC / scene.screenshot).convert("RGB")
    for box in scene.blur:
        region = image.crop(box).filter(ImageFilter.GaussianBlur(30))
        image.paste(region, box)
    return image


def virtual_canvas(screen: Image.Image, index: int) -> Image.Image:
    # A stable vertical canvas. The full 16:9 webpage is visible at the start.
    bg = screen.resize((VIRTUAL_W, 720), Image.Resampling.LANCZOS)
    bg = bg.resize((VIRTUAL_W, VIRTUAL_H), Image.Resampling.BICUBIC)
    bg = bg.filter(ImageFilter.GaussianBlur(55))
    dark = Image.new("RGBA", (VIRTUAL_W, VIRTUAL_H), (1, 7, 12, 185))
    canvas = bg.convert("RGBA")
    canvas.alpha_composite(dark)

    # Thin brand grid only in the empty background around the browser view.
    grid = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(grid, "RGBA")
    for x in range(-400, 1700, 160):
        draw.line((x, 0, x + 680, VIRTUAL_H), fill=(15, 211, 238, 17), width=2)
    draw.arc((-500, 1250, 1550, 3300), 195, 350, fill=(15, 211, 238, 70), width=4)
    canvas.alpha_composite(grid)

    # Actual full page, never cropped in the initial view.
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, "RGBA")
    sd.rounded_rectangle(
        (18, SCREEN_Y + 18, VIRTUAL_W - 18, SCREEN_Y + 720 + 34),
        radius=26,
        fill=(0, 0, 0, 210),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(25))
    canvas.alpha_composite(shadow)
    canvas.paste(screen, (0, SCREEN_Y))
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle(
        (1, SCREEN_Y + 1, VIRTUAL_W - 2, SCREEN_Y + 718),
        radius=18,
        outline=(15, 211, 238, 155),
        width=3,
    )
    return canvas.convert("RGB")


def target_rect(scene: Scene) -> tuple[float, float, float, float]:
    tw = float(scene.target_width)
    th = tw * 16.0 / 9.0
    cx = float(scene.target_x)
    cy = float(SCREEN_Y + scene.target_y)
    left = max(0.0, min(VIRTUAL_W - tw, cx - tw / 2))
    top = max(0.0, min(VIRTUAL_H - th, cy - th / 2))
    return left, top, tw, th


def view_rect(scene: Scene, local: float) -> tuple[float, float, float, float]:
    # 0–22%: show the complete webpage.
    # 22–78%: one eased camera move to the relevant UI element.
    # 78–100%: hold the close-up so it can actually be read.
    if local <= 0.22:
        move = 0.0
    elif local >= 0.78:
        move = 1.0
    else:
        move = smoothstep((local - 0.22) / 0.56)
    tx, ty, tw, th = target_rect(scene)
    left = tx * move
    top = ty * move
    width = VIRTUAL_W + (tw - VIRTUAL_W) * move
    height = VIRTUAL_H + (th - VIRTUAL_H) * move
    return left, top, width, height


def timestamp(seconds: float) -> str:
    minutes = int(seconds // 60)
    rest = seconds % 60
    return f"0:{minutes:02d}:{rest:05.2f}"


def ff_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:")


def write_subtitles() -> None:
    # These timings come from Whisper word timestamps for the supplied MP3.
    events = [
        (0.00, 2.24, r"RANKING nie mówi Ci,\Nkto dzisiaj zagra lepiej."),
        (2.68, 4.90, r"I właśnie dlatego\Npowstał {\c&H00D9F7&}POINTEDGE{\c&HFFFFFF&}."),
        (5.38, 9.60, r"To miejsce porządkuje\Nnajważniejsze informacje\Nprzed meczem tenisowym."),
        (10.22, 12.34, r"NAWIERZCHNIA  •  ETAP TURNIEJU"),
        (12.62, 16.46, r"OSTATNIE SPOTKANIA  •  H2H\NSTYL ZAWODNIKÓW"),
        (17.14, 20.06, r"Wszystko w jednej,\N{\c&H00D9F7&}CZYTELNEJ ANALIZIE{\c&HFFFFFF&}."),
        (20.74, 24.36, r"Mecze {\c&H00D9F7&}ATP I WTA{\c&HFFFFFF&}."),
        (25.12, 28.84, r"Konkretne argumenty\Ni historia wcześniejszych analiz."),
        (28.84, 32.18, r"Wyniki {\c&H00D9F7&}NIE ZNIKAJĄ{\c&HFFFFFF&}\Npo zakończeniu spotkania."),
        (32.86, 34.84, r"Pozostają w\N{\c&H00D9F7&}PUBLICZNYCH STATYSTYKACH{\c&HFFFFFF&}."),
        (35.08, 37.86, r"Możesz samodzielnie\Nocenić ich jakość."),
        (38.50, 42.68, r"Co {\c&H00D9F7&}72 GODZINY{\c&HFFFFFF&}\Npełna analiza publicznie."),
        (43.68, 47.10, r"POINTEDGE.\NMniej szumu. {\c&H00D9F7&}Więcej kontekstu{\c&HFFFFFF&}."),
        (47.84, 52.20, r"Wejdź na {\c&H00D9F7&}POINTEDGE.PL{\c&HFFFFFF&}\Ni zobacz aktualną analizę."),
    ]
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Bahnschrift,59,&H00FFFFFF,&H0000D9F7,&HE0000710,&H00000000,-1,0,0,0,100,100,0.7,0,1,6,2,2,72,220,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, text in events:
        effect = r"{\an2\pos(440,1570)\fad(90,110)\fscx96\fscy96\t(0,140,\fscx100\fscy100)}"
        lines.append(
            f"Dialogue: 8,{timestamp(start)},{timestamp(end)},Caption,,0,0,0,,{effect}{text}\n"
        )
    ASS_FILE.write_text("".join(lines), encoding="utf-8-sig")


def render_camera_master() -> None:
    screens = [load_screen(scene) for scene in SCENES]
    canvases = [virtual_canvas(screen, i) for i, screen in enumerate(screens)]
    title_font = ImageFont.truetype(str(FONT), 24)
    tiny_font = ImageFont.truetype(str(FONT), 17)
    total_frames = int(round(TOTAL * FPS))

    process = subprocess.Popen(
        [
            FFMPEG,
            "-y",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{W}x{H}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(BASE_VIDEO),
        ],
        stdin=subprocess.PIPE,
    )
    assert process.stdin is not None

    for frame_index in range(total_frames):
        now = frame_index / FPS
        scene_index = max(
            i for i, scene in enumerate(SCENES) if scene.start <= now
        )
        scene = SCENES[scene_index]
        duration = scene.end - scene.start
        local = max(0.0, min(1.0, (now - scene.start) / duration))
        left, top, width, height = view_rect(scene, local)
        frame = canvases[scene_index].crop(
            (round(left), round(top), round(left + width), round(top + height))
        ).resize((W, H), Image.Resampling.LANCZOS).convert("RGBA")

        # Crossfade only; no position jump, shake or whip movement.
        fade = 0.32
        if scene_index + 1 < len(SCENES) and now > scene.end - fade:
            alpha = smoothstep((now - (scene.end - fade)) / fade)
            next_scene = SCENES[scene_index + 1]
            nleft, ntop, nwidth, nheight = view_rect(next_scene, 0.0)
            nxt = canvases[scene_index + 1].crop(
                (round(nleft), round(ntop), round(nleft + nwidth), round(ntop + nheight))
            ).resize((W, H), Image.Resampling.LANCZOS).convert("RGBA")
            frame = Image.blend(frame, nxt, alpha)

        # Stable chrome overlay and progress line.
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay, "RGBA")
        draw.rounded_rectangle((48, 72, 1032, 170), radius=34, fill=(1, 8, 14, 205))
        draw.text((82, 111), "POINTEDGE", font=title_font, fill=(245, 250, 253, 255))
        draw.text((82, 145), scene.label, font=tiny_font, fill=(15, 211, 238, 230))
        draw.text((995, 121), f"{scene_index + 1:02d}", font=tiny_font, fill=(145, 165, 180, 180), anchor="ra")
        draw.rectangle((54, 1770, 1026, 1773), fill=(255, 255, 255, 35))
        draw.rectangle(
            (54, 1770, 54 + round((now / TOTAL) * 972), 1773),
            fill=(15, 211, 238, 230),
        )
        frame.alpha_composite(overlay)
        process.stdin.write(frame.convert("RGB").tobytes())

    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("FFmpeg failed while encoding the camera master")


def finish_video() -> None:
    ass = ff_path(ASS_FILE)
    subprocess.run(
        [
            FFMPEG,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(BASE_VIDEO),
            "-i",
            str(AUDIO),
            "-f",
            "lavfi",
            "-t",
            str(TOTAL),
            "-i",
            "sine=frequency=73.42:sample_rate=44100",
            "-filter_complex",
            (
                f"[0:v]subtitles='{ass}':fontsdir='C\\:/Windows/Fonts'[v];"
                "[1:a]highpass=f=70,acompressor=threshold=-18dB:ratio=2.0:"
                "attack=8:release=90,volume=1.10[voice];"
                "[2:a]volume=0.012,tremolo=f=1.35:d=0.45,lowpass=f=185,"
                "afade=t=in:st=0:d=1.0,afade=t=out:st=50.2:d=2.3[music];"
                "[voice][music]amix=inputs=2:duration=first:dropout_transition=0,"
                "alimiter=limit=0.96[a]"
            ),
            "-map",
            "[v]",
            "-map",
            "[a]",
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
            "-t",
            str(TOTAL),
            "-movflags",
            "+faststart",
            str(FINAL_VIDEO),
        ],
        check=True,
    )


def preview() -> None:
    samples = [1, 3.8, 6.5, 11, 15, 18, 22, 27, 31, 36, 40, 45, 49, 52]
    frames = []
    for index, second in enumerate(samples):
        path = WORK / f"preview-{index:02d}.png"
        subprocess.run(
            [
                FFMPEG,
                "-y",
                "-loglevel",
                "error",
                "-ss",
                str(second),
                "-i",
                str(FINAL_VIDEO),
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgb24",
                str(path),
            ],
            check=True,
        )
        frames.append(Image.open(path).convert("RGB").resize((180, 320)))
    sheet = Image.new("RGB", (180 * 7, 640), "#03080d")
    for index, frame in enumerate(frames):
        sheet.paste(frame, ((index % 7) * 180, (index // 7) * 320))
    sheet.save(WORK / "preview-sheet-v3.jpg", quality=94)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    write_subtitles()
    render_camera_master()
    finish_video()
    preview()
    print(FINAL_VIDEO)


if __name__ == "__main__":
    main()
