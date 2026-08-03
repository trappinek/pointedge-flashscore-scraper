from __future__ import annotations

from pathlib import Path
import math
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "output" / "pointedge-promo-v2"
SOURCE = ROOT / "output" / "pointedge-promo"
AUDIO = Path(
    r"C:\Users\dcxml\Downloads\ElevenLabs_2026-07-30T02_35_26_Rafał - Shorts _pvc_sp100_s45_sb80_se2_b_m2.mp3"
)
VIDEO = WORK / "pointedge-czym-jest-cinematic.mp4"
SUBTITLES = WORK / "captions-v2.ass"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

WIDTH, HEIGHT, FPS = 1080, 1920, 30
TRANSITION = 0.35
TOTAL = 52.66
FONT = Path(r"C:\Windows\Fonts\bahnschrift.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\bahnschrift.ttf")

CYAN = (15, 211, 238, 255)
BLUE = (0, 124, 255, 255)
WHITE = (246, 250, 253, 255)
MUTED = (139, 161, 177, 255)
INK = (2, 8, 14, 255)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), size)


def ff_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


def gradient_background(seed: int) -> Image.Image:
    img = Image.new("RGBA", (WIDTH, HEIGHT), (2, 7, 12, 255))
    px = img.load()
    cx = 250 + (seed * 149) % 700
    cy = 530 + (seed * 97) % 900
    for y in range(HEIGHT):
        for x in range(WIDTH):
            d = math.sqrt(((x - cx) / 800) ** 2 + ((y - cy) / 1050) ** 2)
            glow = max(0.0, 1.0 - d)
            edge = max(0.0, 1.0 - abs(x - WIDTH / 2) / 800)
            px[x, y] = (
                int(2 + glow * 2),
                int(7 + glow * 25 + edge * 2),
                int(12 + glow * 38 + edge * 5),
                255,
            )
    draw = ImageDraw.Draw(img, "RGBA")
    for i in range(-4, 10):
        x = i * 155 + (seed * 31) % 120
        draw.line((x, -80, x + 760, HEIGHT + 80), fill=(15, 211, 238, 14), width=2)
    draw.arc((-550, 1040, 1250, 2800), 198, 350, fill=(15, 211, 238, 75), width=4)
    draw.arc((250, -850, 1760, 660), 25, 167, fill=(0, 124, 255, 55), width=3)
    return img


def rounded_card(
    canvas: Image.Image,
    content: Image.Image,
    box: tuple[int, int, int, int],
    radius: int = 42,
    border: tuple[int, int, int, int] = (15, 211, 238, 170),
    shadow: int = 35,
) -> None:
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    content = ImageOps.fit(content.convert("RGB"), (w, h), Image.Resampling.LANCZOS)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=radius, fill=255)

    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    s = Image.new("RGBA", (w, h), (0, 0, 0, 210))
    shadow_layer.paste(s, (x1, y1 + 20), mask)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(shadow))
    canvas.alpha_composite(shadow_layer)
    canvas.paste(content, (x1, y1), mask)
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle(box, radius=radius, outline=border, width=3)


def crop_source(name: str, box: tuple[int, int, int, int], blur=None) -> Image.Image:
    image = Image.open(SOURCE / name).convert("RGB")
    if blur:
        for region in blur:
            part = image.crop(region).filter(ImageFilter.GaussianBlur(26))
            image.paste(part, region)
    return image.crop(box)


def brand_header(draw: ImageDraw.ImageDraw, kicker: str, number: str) -> None:
    draw.text((66, 100), "POINTEDGE", font=font(28), fill=WHITE)
    draw.text((66, 143), "TENNIS INTELLIGENCE", font=font(16), fill=(15, 211, 238, 185))
    draw.text((1010, 104), number, font=font(24), fill=(139, 161, 177, 130), anchor="ra")
    draw.line((66, 190, 1014, 190), fill=(15, 211, 238, 65), width=2)
    draw.text((66, 245), kicker, font=font(26), fill=CYAN)


def title(draw: ImageDraw.ImageDraw, first: str, second: str, y: int = 315) -> None:
    draw.text((66, y), first, font=font(68), fill=WHITE)
    draw.text((66, y + 78), second, font=font(68), fill=CYAN)


def chip(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], active=False) -> None:
    x, y = xy
    bbox = draw.textbbox((0, 0), text, font=font(22))
    w = bbox[2] - bbox[0] + 42
    fill = (15, 211, 238, 225) if active else (7, 20, 29, 235)
    color = INK if active else WHITE
    draw.rounded_rectangle((x, y, x + w, y + 54), radius=27, fill=fill, outline=(15, 211, 238, 100), width=2)
    draw.text((x + 21, y + 27), text, font=font(22), fill=color, anchor="lm")


def create_scenes() -> list[Path]:
    WORK.mkdir(parents=True, exist_ok=True)
    scenes: list[Path] = []

    # 1 — cold open, giant typography and cropped hero.
    img = gradient_background(1)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "DANE > PRZECZUCIA", "01")
    title(draw, "RANKING TO", "NIE WSZYSTKO", 350)
    draw.text((68, 525), "Forma dnia. Nawierzchnia. Styl gry.", font=font(31), fill=MUTED)
    hero = crop_source(
        "01-home.png",
        (250, 115, 1120, 690),
        blur=[(180, 405, 1210, 720)],
    )
    rounded_card(img, hero, (65, 670, 1015, 1370), radius=48)
    draw.rounded_rectangle((65, 1420, 790, 1510), radius=45, fill=(15, 211, 238, 235))
    draw.text((98, 1465), "ZOBACZ PEŁNY KONTEKST", font=font(31), fill=INK, anchor="lm")
    draw.text((925, 1465), "→", font=font(52), fill=CYAN, anchor="mm")
    p = WORK / "scene-01.png"; img.save(p); scenes.append(p)

    # 2 — brand reveal.
    img = gradient_background(2)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "ANALITYKA TENISOWA", "02")
    draw.text((540, 490), "P", font=font(190), fill=CYAN, anchor="mm")
    draw.text((540, 670), "POINTEDGE", font=font(82), fill=WHITE, anchor="mm")
    draw.text((540, 790), "MNIEJ SZUMU.", font=font(52), fill=WHITE, anchor="mm")
    draw.text((540, 860), "WIĘCEJ KONTEKSTU.", font=font(52), fill=CYAN, anchor="mm")
    for x, txt in [(95, "ATP"), (325, "WTA"), (555, "H2H"), (785, "DANE")]:
        chip(draw, txt, (x, 1050), active=txt == "DANE")
    draw.line((165, 1240, 915, 1240), fill=(15, 211, 238, 95), width=3)
    draw.text((540, 1325), "Wszystko przed meczem.", font=font(34), fill=MUTED, anchor="mm")
    p = WORK / "scene-02.png"; img.save(p); scenes.append(p)

    # 3 — matches, tightly focused on the list.
    img = gradient_background(3)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "TERMINARZ ATP / WTA", "03")
    title(draw, "DZISIAJ.", "JUTRO. WYNIKI.", 315)
    matches = crop_source("03-matches.png", (315, 100, 1045, 710))
    rounded_card(img, matches, (80, 560, 1000, 1510), radius=46)
    chip(draw, "DZISIAJ", (80, 1575), active=True)
    chip(draw, "ATP", (300, 1575))
    chip(draw, "WTA", (440, 1575))
    p = WORK / "scene-03.png"; img.save(p); scenes.append(p)

    # 4 — data modules rather than a full page.
    img = gradient_background(4)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "CZTERY WARSTWY ANALIZY", "04")
    title(draw, "CO NAPRAWDĘ", "MA ZNACZENIE?", 315)
    labels = [
        ("01", "NAWIERZCHNIA", "Inne tempo, inne przewagi"),
        ("02", "ETAP TURNIEJU", "Inna presja i stawka meczu"),
        ("03", "OSTATNIE MECZE", "Kontekst zamiast samego wyniku"),
        ("04", "H2H", "Jak zderzają się style gry"),
    ]
    for i, (num, head, body) in enumerate(labels):
        y = 610 + i * 230
        draw.rounded_rectangle((70, y, 1010, y + 178), radius=34, fill=(5, 16, 24, 238), outline=(15, 211, 238, 90), width=2)
        draw.text((110, y + 48), num, font=font(25), fill=CYAN)
        draw.text((205, y + 48), head, font=font(31), fill=WHITE)
        draw.text((205, y + 108), body, font=font(24), fill=MUTED)
    p = WORK / "scene-04.png"; img.save(p); scenes.append(p)

    # 5 — analysis, sensitive areas irreversibly blurred.
    img = gradient_background(5)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "PEŁNY KONTEKST", "05")
    title(draw, "JEDEN MECZ.", "JEDNA ANALIZA.", 315)
    analysis = crop_source(
        "04-analysis.png",
        (190, 80, 1140, 715),
        blur=[(160, 220, 1160, 720)],
    )
    rounded_card(img, analysis, (65, 565, 1015, 1410), radius=48)
    draw.text((85, 1485), "TREŚĆ CHRONIONA", font=font(24), fill=CYAN)
    draw.text((85, 1540), "Aktualne rekomendacje i wartości zostały ukryte.", font=font(25), fill=MUTED)
    p = WORK / "scene-05.png"; img.save(p); scenes.append(p)

    # 6 — ATP/WTA arguments, montage-style split.
    img = gradient_background(6)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "ATP / WTA", "06")
    title(draw, "KONKRETNE", "ARGUMENTY", 315)
    left = crop_source("03-matches.png", (270, 80, 740, 710))
    right = crop_source("04-analysis.png", (650, 85, 1160, 700), blur=[(640, 180, 1180, 720)])
    rounded_card(img, left, (65, 600, 520, 1425), radius=44)
    rounded_card(img, right, (560, 520, 1015, 1345), radius=44)
    draw.rounded_rectangle((430, 745, 650, 965), radius=110, fill=(15, 211, 238, 240))
    draw.text((540, 855), "VS", font=font(58), fill=INK, anchor="mm")
    p = WORK / "scene-06.png"; img.save(p); scenes.append(p)

    # 7 — history and chart crop.
    img = gradient_background(7)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "PUBLICZNA HISTORIA", "07")
    title(draw, "WYNIKI", "ZOSTAJĄ", 315)
    stats = crop_source("05-stats.png", (300, 120, 1115, 665))
    rounded_card(img, stats, (65, 590, 1015, 1260), radius=48)
    draw.text((75, 1350), "Bez kasowania słabszych okresów.", font=font(32), fill=WHITE)
    draw.text((75, 1410), "Historia, skuteczność i YIELD w jednym miejscu.", font=font(27), fill=MUTED)
    p = WORK / "scene-07.png"; img.save(p); scenes.append(p)

    # 8 — chart close-up.
    img = gradient_background(8)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "STATYSTYKI", "08")
    title(draw, "TRANSPARENTNIE.", "BEZ WYBIERANIA.", 315)
    chart = crop_source("05-stats.png", (365, 215, 1110, 620))
    rounded_card(img, chart, (55, 610, 1025, 1260), radius=50)
    for i, txt in enumerate(["SKUTECZNOŚĆ", "LICZBA ANALIZ", "YIELD"]):
        x = 65 + i * 330
        draw.rounded_rectangle((x, 1340, x + 295, 1490), radius=32, fill=(5, 16, 24, 235), outline=(15, 211, 238, 80), width=2)
        draw.text((x + 26, 1400), txt, font=font(21), fill=MUTED)
        draw.line((x + 26, 1450, x + 190, 1450), fill=(15, 211, 238, 180), width=4)
    p = WORK / "scene-08.png"; img.save(p); scenes.append(p)

    # 9 — reviews.
    img = gradient_background(9)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "OPINIE UŻYTKOWNIKÓW", "09")
    title(draw, "SPRAWDŹ,", "CO MÓWIĄ INNI", 315)
    reviews = crop_source("06-reviews.png", (245, 115, 1100, 685))
    rounded_card(img, reviews, (65, 585, 1015, 1370), radius=48)
    draw.text((75, 1455), "★★★★★", font=font(50), fill=(255, 197, 42, 255))
    draw.text((75, 1535), "Zweryfikowane doświadczenia społeczności.", font=font(27), fill=MUTED)
    p = WORK / "scene-09.png"; img.save(p); scenes.append(p)

    # 10 — free analysis and protected paid content.
    img = gradient_background(10)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "DOSTĘP PUBLICZNY", "10")
    title(draw, "PEŁNA ANALIZA", "CO 72 GODZINY", 315)
    method = crop_source("02-method.png", (70, 65, 1130, 455), blur=[(60, 60, 760, 190)])
    rounded_card(img, method, (65, 610, 1015, 1050), radius=48)
    draw.rounded_rectangle((65, 1135, 1015, 1285), radius=45, fill=(15, 211, 238, 240))
    draw.text((540, 1210), "ZOBACZ DARMOWĄ ANALIZĘ", font=font(34), fill=INK, anchor="mm")
    draw.text((540, 1390), "Więcej analiz znajdziesz w PointEdge Pro.", font=font(28), fill=MUTED, anchor="mm")
    p = WORK / "scene-10.png"; img.save(p); scenes.append(p)

    # 11 — clean CTA.
    img = gradient_background(11)
    draw = ImageDraw.Draw(img, "RGBA")
    brand_header(draw, "ANALITYKA TENISOWA", "11")
    draw.text((540, 500), "POINT", font=font(110), fill=WHITE, anchor="rm")
    draw.text((540, 500), "EDGE", font=font(110), fill=CYAN, anchor="lm")
    draw.text((540, 700), "ZOBACZ TENIS", font=font(67), fill=WHITE, anchor="mm")
    draw.text((540, 785), "Z INNEJ PERSPEKTYWY", font=font(67), fill=CYAN, anchor="mm")
    draw.rounded_rectangle((165, 965, 915, 1115), radius=75, fill=(15, 211, 238, 245))
    draw.text((540, 1040), "POINTEDGE.PL", font=font(54), fill=INK, anchor="mm")
    draw.text((540, 1245), "ATP  •  WTA  •  ANALIZY  •  STATYSTYKI", font=font(25), fill=MUTED, anchor="mm")
    p = WORK / "scene-11.png"; img.save(p); scenes.append(p)
    return scenes


def ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int(seconds // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def write_subtitles() -> None:
    # Timings follow the actual pauses detected in the supplied ElevenLabs MP3.
    events = [
        (0.05, 2.24, r"RANKING nie mówi Ci,"),
        (2.78, 5.00, r"kto {\c&H00D9F7&}DZISIAJ{\c&HFFFFFF&} zagra lepiej."),
        (5.52, 9.67, r"I właśnie dlatego powstał\N{\c&H00D9F7&}POINTEDGE{\c&HFFFFFF&}."),
        (10.29, 13.72, r"Porządkujemy najważniejsze informacje"),
        (14.14, 16.53, r"przed każdym {\c&H00D9F7&}MECZEM TENISOWYM{\c&HFFFFFF&}."),
        (17.23, 20.02, r"NAWIERZCHNIA  •  ETAP TURNIEJU"),
        (20.85, 24.50, r"OSTATNIE MECZE  •  H2H"),
        (25.23, 28.70, r"Cały kontekst w jednej,\N{\c&H00D9F7&}CZYTELNEJ ANALIZIE{\c&HFFFFFF&}."),
        (29.76, 32.19, r"Mecze ATP i WTA\Noraz konkretne argumenty."),
        (33.02, 37.53, r"Do tego historia\Nwcześniejszych analiz."),
        (38.68, 42.59, r"Wyniki {\c&H00D9F7&}NIE ZNIKAJĄ{\c&HFFFFFF&}\Npo zakończeniu meczu."),
        (43.81, 47.86, r"Pełna analiza publicznie\Nco {\c&H00D9F7&}72 GODZINY{\c&HFFFFFF&}."),
        (47.86, 52.18, r"Więcej tenisowych analiz\Nznajdziesz na {\c&H00D9F7&}POINTEDGE.PL{\c&HFFFFFF&}."),
    ]
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Bahnschrift,61,&H00FFFFFF,&H0000D9F7,&HD8000810,&H85000000,-1,0,0,0,100,100,0.8,0,1,6,2,2,70,210,315,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, text in events:
        effect = r"{\an2\pos(465,1545)\fad(100,130)\fscx88\fscy88\t(0,180,\fscx100\fscy100)}"
        lines.append(f"Dialogue: 8,{ts(start)},{ts(end)},Caption,,0,0,0,,{effect}{text}\n")
    SUBTITLES.write_text("".join(lines), encoding="utf-8-sig")


def render_scene(image: Path, duration: float, index: int) -> Path:
    output = WORK / f"clip-{index:02d}.mp4"
    # Alternating push-ins and pull-outs create a visible but fluid camera move.
    direction = 1 if index % 2 else -1
    zoom = (
        "min(1.16,1.0+0.00078*on)"
        if index % 2
        else "max(1.0,1.16-0.00072*on)"
    )
    fg = (
        f"zoompan=z='{zoom}':"
        f"x='iw/2-(iw/zoom/2)+{direction}*34*sin(on/38)':"
        f"y='ih/2-(ih/zoom/2)+18*cos(on/47)':"
        f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
    )
    graph = (
        f"[0:v]{fg},"
        "eq=contrast=1.03:saturation=1.04,"
        "drawbox=x='-260+mod(t*410,1600)':y=0:w=120:h=1920:color=0x14d5ee@0.025:t=fill,"
        "drawbox=x=54:y=1740:w=972:h=3:color=white@0.10:t=fill,"
        f"drawbox=x=54:y=1740:w='min(t/{duration:.3f}*972,972)':h=3:color=0x14d5ee@0.88:t=fill,"
        "format=yuv420p[v]"
    )
    subprocess.run(
        [
            FFMPEG, "-y", "-loglevel", "error",
            "-framerate", str(FPS), "-loop", "1", "-t", f"{duration:.3f}", "-i", str(image),
            "-filter_complex", graph, "-map", "[v]", "-an", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart", str(output),
        ],
        check=True,
    )
    return output


def combine(clips: list[Path], durations: list[float]) -> None:
    offsets = []
    acc = durations[0]
    for duration in durations[1:]:
        offsets.append(acc - TRANSITION)
        acc += duration - TRANSITION

    command = [FFMPEG, "-y", "-loglevel", "error"]
    for clip in clips:
        command.extend(["-i", str(clip)])
    command.extend([
        "-i", str(AUDIO),
        "-f", "lavfi", "-t", str(TOTAL), "-i", "sine=frequency=73.42:sample_rate=44100",
        "-f", "lavfi", "-t", str(TOTAL), "-i", "sine=frequency=146.83:sample_rate=44100",
    ])
    transitions = [
        "smoothleft", "fadeblack", "smoothup", "circleopen", "slideleft",
        "fadewhite", "smoothright", "fadeblack", "slideup", "fade",
    ]
    chain = []
    previous = "[0:v]"
    for i, offset in enumerate(offsets, start=1):
        out = f"[x{i}]"
        chain.append(
            f"{previous}[{i}:v]xfade=transition={transitions[i-1]}:"
            f"duration={TRANSITION}:offset={offset:.3f}{out}"
        )
        previous = out

    sub = ff_path(SUBTITLES)
    chain.append(
        f"{previous}subtitles='{sub}':fontsdir='C\\:/Windows/Fonts',format=yuv420p[vout]"
    )
    voice_input = len(clips)
    tone1 = voice_input + 1
    tone2 = voice_input + 2
    chain.append(
        f"[{tone1}:a]volume=0.015,tremolo=f=1.7:d=0.55,lowpass=f=190,"
        "afade=t=in:st=0:d=1.2,afade=t=out:st=50.3:d=2.2[m1]"
    )
    chain.append(
        f"[{tone2}:a]volume=0.006,tremolo=f=0.83:d=0.35,lowpass=f=330,"
        "afade=t=in:st=0:d=1.4,afade=t=out:st=50.1:d=2.4[m2]"
    )
    chain.append(
        f"[{voice_input}:a]highpass=f=70,acompressor=threshold=-18dB:ratio=2.0:"
        "attack=8:release=90,volume=1.10[voice]"
    )
    chain.append(
        "[voice][m1][m2]amix=inputs=3:duration=first:dropout_transition=0,"
        "alimiter=limit=0.96[aout]"
    )
    command.extend([
        "-filter_complex", ";".join(chain),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-t", str(TOTAL),
        "-movflags", "+faststart", str(VIDEO),
    ])
    subprocess.run(command, check=True)


def preview() -> None:
    samples = [2, 7, 12, 18, 23, 28, 34, 40, 46, 51]
    frames = []
    for i, second in enumerate(samples, start=1):
        frame = WORK / f"preview-{i:02d}.png"
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-ss", str(second), "-i", str(VIDEO),
             "-frames:v", "1", "-pix_fmt", "rgb24", str(frame)],
            check=True,
        )
        frames.append(Image.open(frame).convert("RGB").resize((216, 384)))
    sheet = Image.new("RGB", (216 * 5, 384 * 2), "#04090e")
    for i, frame in enumerate(frames):
        sheet.paste(frame, ((i % 5) * 216, (i // 5) * 384))
    sheet.save(WORK / "preview-sheet-v2.jpg", quality=94)


def main() -> None:
    scenes = create_scenes()
    write_subtitles()
    durations = [5.5, 5.0, 6.0, 4.0, 5.0, 4.0, 4.0, 5.0, 5.0, 5.0, 7.66]
    clips = [render_scene(scene, duration, i) for i, (scene, duration) in enumerate(zip(scenes, durations), 1)]
    combine(clips, durations)
    preview()
    print(VIDEO)


if __name__ == "__main__":
    main()
