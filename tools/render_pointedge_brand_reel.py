from __future__ import annotations

from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "output" / "pointedge-promo"
AUDIO = Path(
    r"C:\Users\dcxml\Downloads\ElevenLabs_2026-07-30T02_11_51_Rafał - Shorts _pvc_sp100_s45_sb80_se2_b_m2.mp3"
)
VIDEO = WORK / "pointedge-czym-jest-final.mp4"
SUBTITLES = WORK / "captions.ass"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

WIDTH = 1080
HEIGHT = 1920
FPS = 30
TRANSITION = 0.5

FONT = Path(r"C:\Windows\Fonts\bahnschrift.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")


def ff_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


def blur_region(image: Image.Image, box: tuple[int, int, int, int], radius: int = 22) -> None:
    region = image.crop(box).filter(ImageFilter.GaussianBlur(radius))
    image.paste(region, box)


def fit_crop(image: Image.Image, top: int, bottom: int) -> Image.Image:
    crop = image.crop((0, top, image.width, min(bottom, image.height))).convert("RGB")
    target_ratio = 2.0
    ratio = crop.width / crop.height
    if ratio > target_ratio:
        target_width = int(crop.height * target_ratio)
        left = (crop.width - target_width) // 2
        crop = crop.crop((left, 0, left + target_width, crop.height))
    elif ratio < target_ratio:
        target_height = int(crop.width / target_ratio)
        top_crop = max(0, (crop.height - target_height) // 2)
        crop = crop.crop((0, top_crop, crop.width, top_crop + target_height))
    return crop.resize((1280, 640), Image.Resampling.LANCZOS)


def prepare_screens() -> list[Path]:
    specs = [
        ("01-home.png", 72, 712, []),
        ("03-matches.png", 72, 712, []),
        (
            "04-analysis.png",
            78,
            718,
            [
                # Recommendation, odds and the opening paragraphs can identify
                # the current public selection. Blur them before they ever
                # become video frames.
                (190, 300, 1065, 720),
            ],
        ),
        ("05-stats.png", 80, 720, []),
        ("06-reviews.png", 72, 712, []),
        (
            "02-method.png",
            72,
            712,
            [
                # Current free recommendation visible at the top edge.
                (85, 70, 680, 170),
            ],
        ),
    ]
    prepared: list[Path] = []
    for index, (name, top, bottom, blur_boxes) in enumerate(specs, start=1):
        image = Image.open(WORK / name).convert("RGB")
        for box in blur_boxes:
            blur_region(image, box)
        image = fit_crop(image, top, bottom)
        destination = WORK / f"scene-{index:02d}.png"
        image.save(destination, quality=95)
        prepared.append(destination)
    prepared.append(create_outro())
    return prepared


def create_outro() -> Path:
    image = Image.new("RGB", (1280, 640), "#040a11")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            dx = (x - 900) / 700
            dy = (y - 310) / 500
            glow = max(0.0, 1.0 - (dx * dx + dy * dy))
            px[x, y] = (
                int(4 + glow * 2),
                int(10 + glow * 22),
                int(17 + glow * 32),
            )

    draw = ImageDraw.Draw(image, "RGBA")
    cyan = (20, 213, 238, 255)
    white = (246, 249, 252, 255)
    muted = (145, 165, 180, 255)
    draw.arc((680, -330, 1480, 470), 12, 205, fill=(20, 213, 238, 110), width=4)
    draw.arc((760, 270, 1390, 900), 184, 355, fill=(20, 213, 238, 70), width=3)
    for offset in range(0, 480, 80):
        draw.line((740 + offset, 0, 1120 + offset, 640), fill=(20, 213, 238, 18), width=2)

    logo_source = Image.open(WORK / "01-home.png").convert("RGB")
    logo = logo_source.crop((62, 15, 257, 61)).resize((390, 92), Image.Resampling.LANCZOS)
    image.paste(logo, (445, 74))

    title = ImageFont.truetype(str(FONT_BOLD), 62)
    body = ImageFont.truetype(str(FONT), 30)
    url_font = ImageFont.truetype(str(FONT_BOLD), 42)
    draw.text((640, 230), "MNIEJ SZUMU.", font=title, fill=white, anchor="mm")
    draw.text((640, 302), "WIĘCEJ KONTEKSTU.", font=title, fill=cyan, anchor="mm")
    draw.rounded_rectangle((402, 390, 878, 486), radius=48, fill=(20, 213, 238, 245))
    draw.text((640, 438), "POINTEDGE.PL", font=url_font, fill=(1, 12, 18, 255), anchor="mm")
    draw.text((640, 560), "ANALITYKA TENISOWA  •  ATP / WTA", font=body, fill=muted, anchor="mm")

    destination = WORK / "scene-07.png"
    image.save(destination, quality=95)
    return destination


def timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def write_subtitles() -> None:
    events = [
        (0.05, 2.85, r"RANKING nie mówi Ci,"),
        (2.85, 5.70, r"kto DZISIAJ zagra lepiej."),
        (5.70, 9.95, r"I właśnie dlatego powstał\N{\c&H00D9F7&}POINTEDGE{\c&HFFFFFF&}."),
        (9.95, 13.45, r"Porządkujemy najważniejsze\Ninformacje"),
        (13.45, 17.05, r"przed każdym MECZEM TENISOWYM."),
        (17.05, 20.10, r"NAWIERZCHNIA  •  ETAP TURNIEJU"),
        (20.10, 23.45, r"OSTATNIE MECZE  •  H2H"),
        (23.45, 28.80, r"Cały kontekst w jednej,\NCZYTELNEJ ANALIZIE."),
        (28.80, 32.25, r"Mecze ATP i WTA\Noraz konkretne argumenty."),
        (32.25, 35.95, r"Do tego historia\Nwcześniejszych analiz."),
        (35.95, 39.85, r"Wyniki NIE ZNIKAJĄ\Npo zakończeniu meczu."),
        (39.85, 43.85, r"Zostają w PUBLICZNYCH\NSTATYSTYKACH."),
        (43.85, 46.45, r"Pełna analiza publicznie\Nco 72 GODZINY."),
        (46.45, 48.72, r"{\c&H00D9F7&}POINTEDGE.PL{\c&HFFFFFF&}"),
    ]
    header = r"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Bahnschrift,54,&H00FFFFFF,&H0000D9F7,&HCC00101A,&H00000000,-1,0,0,0,100,100,1.0,0,1,5,0,2,85,215,385,1
Style: Scene,Bahnschrift,30,&H0000D9F7,&H0000D9F7,&HCC00101A,&H00000000,-1,0,0,0,100,100,3.2,0,1,3,0,7,72,72,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, text in events:
        effect = (
            r"{\an2\pos(430,1510)\fad(130,130)"
            r"\fscx94\fscy94\t(0,180,\fscx100\fscy100)}"
        )
        lines.append(
            f"Dialogue: 5,{timestamp(start)},{timestamp(end)},Caption,,0,0,0,,{effect}{text}\n"
        )
    SUBTITLES.write_text("".join(lines), encoding="utf-8-sig")


def render_scene(image: Path, duration: float, title: str, index: int) -> Path:
    output = WORK / f"clip-{index:02d}.mp4"
    font = ff_path(FONT)
    safe_title = title.replace(":", r"\:")
    filter_graph = (
        "[0:v]split=2[rawbg][rawfg];"
        "[rawbg]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,gblur=sigma=38,"
        "eq=brightness=-0.58:contrast=1.12:saturation=0.78[bg];"
        "[rawfg]scale=1110:555,"
        "zoompan=z='1.015+0.00022*on':"
        "x='iw/2-(iw/zoom/2)+8*sin(on/35)':"
        "y='ih/2-(ih/zoom/2)+5*cos(on/43)':"
        "d=1:s=1040x520:fps=30[fg];"
        "[bg]"
        "drawbox=x=0:y=0:w=1080:h=1920:color=0x02070d@0.38:t=fill,"
        "drawbox=x='mod(t*260,1380)-300':y=0:w=130:h=1920:"
        "color=0x14d5ee@0.030:t=fill,"
        "drawbox=x=20:y=397:w=1040:h=572:color=black@0.58:t=fill,"
        "drawbox=x=20:y=397:w=1040:h=572:color=0x14d5ee@0.60:t=2,"
        f"drawtext=fontfile='{font}':text='{safe_title}':"
        "fontcolor=0x14d5ee:fontsize=31:x=72:y=276:"
        "borderw=2:bordercolor=0x00101a@0.85,"
        "drawtext=fontfile='"
        + font
        + "':text='POINTEDGE  /  TENNIS INTELLIGENCE':"
        "fontcolor=white@0.58:fontsize=22:x=72:y=190,"
        "drawbox=x=72:y=330:w=170:h=3:color=0x14d5ee@0.95:t=fill[base];"
        "[base][fg]overlay=x='20+7*sin(t*0.75)':"
        "y='420+9*cos(t*0.58)':shortest=1,"
        "drawbox=x=72:y=1700:w=936:h=3:color=white@0.12:t=fill,"
        f"drawbox=x=72:y=1700:w='min(t/{duration:.3f}*936,936)':"
        "h=3:color=0x14d5ee@0.92:t=fill,"
        "format=yuv420p[v]"
    )
    command = [
        FFMPEG,
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        str(FPS),
        "-loop",
        "1",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(image),
        "-filter_complex",
        filter_graph,
        "-map",
        "[v]",
        "-an",
        "-r",
        str(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "19",
        "-movflags",
        "+faststart",
        str(output),
    ]
    subprocess.run(command, check=True)
    return output


def combine(clips: list[Path]) -> None:
    durations = [6.0, 7.0, 8.0, 8.5, 7.5, 8.0, 6.74]
    offsets = [5.5, 12.0, 19.5, 27.5, 34.5, 42.0]
    command = [FFMPEG, "-y", "-loglevel", "error"]
    for clip in clips:
        command.extend(["-i", str(clip)])
    command.extend(
        [
            "-i",
            str(AUDIO),
            "-f",
            "lavfi",
            "-t",
            "48.74",
            "-i",
            "sine=frequency=82.41:sample_rate=44100",
            "-f",
            "lavfi",
            "-t",
            "48.74",
            "-i",
            "sine=frequency=164.81:sample_rate=44100",
        ]
    )

    chain = []
    previous = "[0:v]"
    for index, offset in enumerate(offsets, start=1):
        out = f"[x{index}]"
        chain.append(
            f"{previous}[{index}:v]xfade=transition="
            f"{['fadeblack','slideleft','smoothup','circleopen','slideright','fade'][index-1]}:"
            f"duration={TRANSITION}:offset={offset}{out}"
        )
        previous = out
    subtitle = ff_path(SUBTITLES)
    fonts = "C\\:/Windows/Fonts"
    chain.append(
        f"{previous}subtitles='{subtitle}':fontsdir='{fonts}',"
        "drawbox=x=0:y=0:w=1080:h=120:color=black@0.15:t=fill,"
        "format=yuv420p[vout]"
    )
    # A quiet, original electronic bed. It stays well below the narration.
    chain.append(
        "[8:a]volume=0.020,tremolo=f=2.0:d=0.72,lowpass=f=210,"
        "afade=t=in:st=0:d=1.2,afade=t=out:st=46.7:d=2.0[m1]"
    )
    chain.append(
        "[9:a]volume=0.008,tremolo=f=1.0:d=0.45,lowpass=f=420,"
        "afade=t=in:st=0:d=1.5,afade=t=out:st=46.5:d=2.2[m2]"
    )
    chain.append(
        "[7:a]highpass=f=75,acompressor=threshold=-18dB:ratio=2.2:"
        "attack=8:release=90,volume=1.12[voice]"
    )
    chain.append(
        "[voice][m1][m2]amix=inputs=3:duration=first:dropout_transition=0,"
        "alimiter=limit=0.95[aout]"
    )
    command.extend(
        [
            "-filter_complex",
            ";".join(chain),
            "-map",
            "[vout]",
            "-map",
            "[aout]",
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
            "48.74",
            "-movflags",
            "+faststart",
            str(VIDEO),
        ]
    )
    subprocess.run(command, check=True)


def preview() -> None:
    frames = []
    for index, second in enumerate([2, 8, 15, 24, 32, 39, 46], start=1):
        frame = WORK / f"preview-{index:02d}.png"
        subprocess.run(
            [
                FFMPEG,
                "-y",
                "-loglevel",
                "error",
                "-ss",
                str(second),
                "-i",
                str(VIDEO),
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgb24",
                str(frame),
            ],
            check=True,
        )
        frames.append(Image.open(frame).convert("RGB").resize((270, 480)))
    sheet = Image.new("RGB", (270 * len(frames), 480), "#080d13")
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index * 270, 0))
    sheet.save(WORK / "preview-sheet.jpg", quality=92)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    screens = prepare_screens()
    write_subtitles()
    durations = [6.0, 7.0, 8.0, 8.5, 7.5, 8.0, 6.74]
    titles = [
        "NIE ZGADUJ. ZOBACZ ARGUMENTY.",
        "MECZE ATP / WTA",
        "PEŁNA ANALIZA MECZU",
        "PUBLICZNA HISTORIA WYNIKÓW",
        "OPINIE UŻYTKOWNIKÓW",
        "JEDNA ANALIZA PUBLICZNIE / 72 H",
        "POINTEDGE.PL",
    ]
    clips = [
        render_scene(screen, duration, title, index)
        for index, (screen, duration, title) in enumerate(
            zip(screens, durations, titles), start=1
        )
    ]
    combine(clips)
    preview()
    print(VIDEO)


if __name__ == "__main__":
    main()
