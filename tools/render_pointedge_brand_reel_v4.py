from __future__ import annotations

from pathlib import Path
import math
import subprocess

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "output" / "pointedge-promo"
WORK = ROOT / "output" / "pointedge-promo-v4"
AUDIO = Path(
    r"C:\Users\dcxml\Downloads\ElevenLabs_2026-07-30T02_35_26_Rafał - Shorts _pvc_sp100_s45_sb80_se2_b_m2.mp3"
)
MASTER = WORK / "dynamic-master.mp4"
FINAL = WORK / "pointedge-czym-jest-dynamic-final.mp4"
ASS = WORK / "captions.ass"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS, TOTAL = 1080, 1920, 30, 52.66
FONT = Path(r"C:\Windows\Fonts\bahnschrift.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\bahnschrift.ttf")
CYAN = (15, 211, 238)
BLUE = (23, 108, 255)
INK = (3, 9, 15)
_BACKGROUND_BASE: Image.Image | None = None


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def ease(value: float) -> float:
    value = clamp(value)
    return value * value * (3 - 2 * value)


def ease_out(value: float) -> float:
    value = clamp(value)
    return 1 - (1 - value) ** 4


def lerp(a: float, b: float, value: float) -> float:
    return a + (b - a) * value


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), size)


def redact(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    """Pixel-glass redaction: hides only sensitive words or numbers."""
    region = image.crop(box)
    tiny = region.resize(
        (max(2, region.width // 18), max(2, region.height // 18)),
        Image.Resampling.BILINEAR,
    ).resize(region.size, Image.Resampling.NEAREST)
    shade = Image.new("RGBA", region.size, (2, 12, 18, 92))
    tiny = tiny.convert("RGBA")
    tiny.alpha_composite(shade)
    image.paste(tiny.convert("RGB"), box)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle(box, radius=7, outline=(*CYAN, 90), width=2)


def sanitized(name: str) -> Image.Image:
    image = Image.open(SRC / name).convert("RGB")
    boxes: dict[str, list[tuple[int, int, int, int]]] = {
        "01-home.png": [
            (358, 17, 440, 61),  # navbar: Typy
        ],
        "02-method.png": [
            (358, 17, 440, 61),
            (106, 76, 674, 149),  # recommended selection
            (140, 346, 390, 377),  # "bieżące typy"
            (740, 330, 848, 377),  # price
            (918, 477, 1065, 542),  # "Typy i..."
        ],
        "03-matches.png": [
            (358, 17, 440, 61),
        ],
        "04-analysis.png": [
            (358, 17, 440, 61),
            (222, 359, 621, 426),  # label + recommendation
            (893, 338, 1032, 425),  # odds + bookmaker
            (224, 471, 363, 502),  # "Mój typ..."
        ],
        "05-stats.png": [
            (358, 17, 440, 61),
            (117, 165, 238, 211),  # tips count label
        ],
        "06-reviews.png": [
            (358, 17, 440, 61),
        ],
    }
    for box in boxes.get(name, []):
        redact(image, box)
    return image


def background(now: float) -> Image.Image:
    global _BACKGROUND_BASE
    if _BACKGROUND_BASE is None:
        strip = Image.new("RGB", (1, H), INK)
        strip_px = strip.load()
        for y in range(H):
            glow = max(0.0, 1 - abs(y - 820) / 1050)
            strip_px[0, y] = (int(2 + 2 * glow), int(8 + 11 * glow), int(14 + 17 * glow))
        base = strip.resize((W, H), Image.Resampling.NEAREST).convert("RGBA")
        glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow_layer, "RGBA").ellipse(
            (310, 220, 1340, 1360), fill=(*BLUE, 34)
        )
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(210))
        base.alpha_composite(glow_layer)
        _BACKGROUND_BASE = base
    base = _BACKGROUND_BASE.copy()
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    for i in range(15):
        seed = i * 97
        x = (seed * 13 + 80) % W
        y = (seed * 29 + int(now * (8 + i % 4))) % H
        radius = 2 + (i % 3)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*CYAN, 22))
    draw.arc((-420, 1160, 1380, 2730), 194, 352, fill=(*CYAN, 65), width=3)
    draw.arc((-550, 1250, 1480, 2910), 198, 350, fill=(*BLUE, 30), width=2)
    return Image.alpha_composite(base, layer)


def rounded_screen(
    screen: Image.Image,
    width: int,
    x: int,
    y: int,
    radius: int = 28,
    crop: tuple[int, int, int, int] | None = None,
) -> Image.Image:
    if crop:
        screen = screen.crop(crop)
    height = round(width * screen.height / screen.width)
    screen = screen.resize((width, height), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", screen.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width, height), radius=radius, fill=255)
    screen.putalpha(mask)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (width + 90, height + 90), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (45, 45, width + 45, height + 45), radius=radius, fill=(0, 0, 0, 190)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    out.alpha_composite(shadow, (x - 45, y - 45))
    out.alpha_composite(screen, (x, y))
    ImageDraw.Draw(out, "RGBA").rounded_rectangle(
        (x, y, x + width, y + height), radius=radius, outline=(*CYAN, 155), width=2
    )
    return out


def full_page_view(
    screen: Image.Image,
    local: float,
    focus_x: int,
    focus_y: int,
    target_width: int,
    zoom_start: float = 0.22,
    zoom_end: float = 0.78,
) -> Image.Image:
    """Full-bleed page presentation: wide site first, then a stable detail zoom."""
    screen_w = W
    screen_h = round(screen_w * screen.height / screen.width)
    screen_y = (H - screen_h) // 2

    blurred = screen.resize((W, H), Image.Resampling.BICUBIC)
    blurred = blurred.filter(ImageFilter.GaussianBlur(48)).convert("RGBA")
    blurred.alpha_composite(Image.new("RGBA", (W, H), (0, 5, 10, 145)))
    page = screen.resize((screen_w, screen_h), Image.Resampling.LANCZOS).convert("RGBA")
    blurred.alpha_composite(page, (0, screen_y))

    if local <= zoom_start:
        amount = 0.0
    elif local >= zoom_end:
        amount = 1.0
    else:
        amount = ease((local - zoom_start) / (zoom_end - zoom_start))

    scale = W / screen.width
    target_w = target_width * scale
    target_h = target_w * H / W
    target_cx = focus_x * scale
    target_cy = screen_y + focus_y * scale
    target_left = max(0.0, min(W - target_w, target_cx - target_w / 2))
    target_top = max(0.0, min(H - target_h, target_cy - target_h / 2))

    left = lerp(0.0, target_left, amount)
    top = lerp(0.0, target_top, amount)
    width = lerp(float(W), target_w, amount)
    height = lerp(float(H), target_h, amount)
    view = blurred.crop(
        (round(left), round(top), round(left + width), round(top + height))
    ).resize((W, H), Image.Resampling.LANCZOS)

    readability = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shade = ImageDraw.Draw(readability, "RGBA")
    shade.rectangle((0, 0, W, 205), fill=(0, 5, 10, 115))
    shade.rectangle((0, 1430, W, H), fill=(0, 5, 10, 105))
    view.alpha_composite(readability)
    return view


def title_chrome(frame: Image.Image, index: str, label: str, progress: float) -> None:
    draw = ImageDraw.Draw(frame, "RGBA")
    draw.text((58, 66), "POINT", font=font(28), fill=(245, 250, 253, 255))
    draw.text((151, 66), "EDGE", font=font(28), fill=(*CYAN, 255))
    draw.text((59, 106), label, font=font(17), fill=(*CYAN, 210))
    draw.text((1018, 72), index, font=font(18), fill=(160, 179, 192, 180), anchor="ra")
    draw.line((58, 146, 1022, 146), fill=(255, 255, 255, 40), width=2)
    draw.line((58, 146, 58 + round(964 * progress), 146), fill=(*CYAN, 235), width=3)


def kinetic_card(
    frame: Image.Image,
    x: int,
    y: int,
    width: int,
    height: int,
    heading: str,
    text: str,
    amount: float,
    accent: tuple[int, int, int] = CYAN,
) -> None:
    amount = ease_out(amount)
    x = round(x + (1 - amount) * 120)
    alpha = round(255 * amount)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=30,
        fill=(6, 16, 24, round(225 * amount)),
        outline=(*accent, round(150 * amount)),
        width=2,
    )
    draw.rectangle((x + 24, y + 24, x + 30, y + height - 24), fill=(*accent, alpha))
    draw.text((x + 56, y + 35), heading, font=font(25), fill=(*accent, alpha))
    draw.multiline_text(
        (x + 56, y + 80),
        text,
        font=font(32),
        fill=(244, 248, 251, alpha),
        spacing=8,
    )
    frame.alpha_composite(layer)


def scene_home(now: float, start: float, end: float, image: Image.Image) -> Image.Image:
    local = clamp((now - start) / (end - start))
    return full_page_view(image, local, 640, 290, 650, 0.18, 0.72)


def scene_scroll(now: float, start: float, end: float, image: Image.Image) -> Image.Image:
    local = clamp((now - start) / (end - start))
    frame = full_page_view(image, local, 640, 320, 680, 0.16, 0.62)
    kinetic_card(
        frame,
        90,
        1160,
        900,
        250,
        "JEDEN WIDOK",
        "Dane przed meczem\nbez szukania w wielu miejscach",
        clamp((local - 0.30) / 0.28),
    )
    return frame


def scene_analysis(now: float, start: float, end: float, image: Image.Image) -> Image.Image:
    local = clamp((now - start) / (end - start))
    frame = full_page_view(image, local, 660, 410, 720, 0.12, 0.52)
    cards = [
        ("NAWIERZCHNIA", "tempo i warunki kortu"),
        ("H2H", "bezpośrednie spotkania"),
        ("OSTATNIE MECZE", "aktualny kontekst"),
    ]
    for idx, (heading, text) in enumerate(cards):
        kinetic_card(
            frame,
            90,
            940 + idx * 180,
            900,
            145,
            heading,
            text,
            clamp((local - (0.44 + idx * 0.10)) / 0.15),
        )
    return frame


def scene_typography(now: float, start: float, end: float, mode: str) -> Image.Image:
    local = clamp((now - start) / (end - start))
    frame = background(now)
    if mode == "one":
        lines = [
            ("NAWIERZCHNIA", "01"),
            ("H2H I OSTATNIE MECZE", "02"),
            ("STYL ZAWODNIKÓW", "03"),
        ]
    else:
        lines = [
            ("DANE", "sprawdzone informacje"),
            ("KONTEKST", "to, co zmienia spotkanie"),
            ("HISTORIA", "wyniki pozostają publiczne"),
        ]
    draw = ImageDraw.Draw(frame, "RGBA")
    for idx, (heading, sub) in enumerate(lines):
        amount = ease_out(clamp((local - idx * 0.16) / 0.23))
        x = round(lerp(1160, 80, amount))
        y = 315 + idx * 300
        draw.text((x, y), heading, font=font(58), fill=(246, 250, 252, round(255 * amount)))
        draw.text((x, y + 88), sub, font=font(25), fill=(*CYAN, round(220 * amount)))
        draw.line((x, y + 145, 1000, y + 145), fill=(*CYAN, round(90 * amount)), width=2)
    return frame


def scene_matches(now: float, start: float, end: float, image: Image.Image) -> Image.Image:
    local = clamp((now - start) / (end - start))
    return full_page_view(image, local, 650, 395, 650, 0.12, 0.66)


def scene_stats(now: float, start: float, end: float, image: Image.Image) -> Image.Image:
    local = clamp((now - start) / (end - start))
    return full_page_view(image, local, 710, 430, 660, 0.14, 0.72)


def scene_countdown(now: float, start: float, end: float) -> Image.Image:
    local = clamp((now - start) / (end - start))
    frame = background(now)
    draw = ImageDraw.Draw(frame, "RGBA")
    scale = ease_out(local / 0.30)
    radius = round(235 * scale)
    center = (540, 720)
    draw.ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius),
        outline=(*CYAN, 190),
        width=5,
    )
    end_angle = -90 + 360 * ease(local)
    draw.arc(
        (center[0] - radius - 17, center[1] - radius - 17, center[0] + radius + 17, center[1] + radius + 17),
        -90,
        end_angle,
        fill=(*BLUE, 240),
        width=13,
    )
    draw.text(center, "72 H", font=font(108), fill=(246, 250, 252, 255), anchor="mm")
    draw.text((540, 1040), "PEŁNA ANALIZA PUBLICZNIE", font=font(36), fill=(*CYAN, 255), anchor="mm")
    return frame


def scene_reviews(now: float, start: float, end: float, image: Image.Image) -> Image.Image:
    local = clamp((now - start) / (end - start))
    frame = background(now)
    # A sideways carousel movement is visually distinct from every page shot.
    crop = (135, 85, 1240, 710)
    width = 930
    x = round(lerp(1080, 75, ease_out(local / 0.28)))
    frame.alpha_composite(rounded_screen(image, width, x, 315, crop=crop))
    draw = ImageDraw.Draw(frame, "RGBA")
    alpha = round(255 * ease_out(clamp((local - 0.38) / 0.22)))
    for index in range(5):
        cx = 380 + index * 80
        cy = 1250
        points = []
        for point_index in range(10):
            angle = -math.pi / 2 + point_index * math.pi / 5
            radius = 27 if point_index % 2 == 0 else 12
            points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
        draw.polygon(points, fill=(255, 190, 28, alpha))
    draw.text(
        (540, 1350),
        "Sprawdź doświadczenia użytkowników",
        font=font(31),
        fill=(245, 249, 251, alpha),
        anchor="mm",
    )
    return frame


def scene_brand_statement(now: float, start: float, end: float) -> Image.Image:
    local = clamp((now - start) / (end - start))
    frame = background(now)
    draw = ImageDraw.Draw(frame, "RGBA")
    statements = [
        ("MNIEJ", "SZUMU."),
        ("WIĘCEJ", "KONTEKSTU."),
    ]
    for idx, (first, second) in enumerate(statements):
        amount = ease_out(clamp((local - idx * 0.22) / 0.30))
        y = 420 + idx * 390
        x = round(lerp(-650 if idx == 0 else 1150, 90, amount))
        draw.text((x, y), first, font=font(86), fill=(247, 250, 252, round(255 * amount)))
        draw.text((x, y + 112), second, font=font(86), fill=(*CYAN, round(255 * amount)))
        draw.line((90, y + 245, 990, y + 245), fill=(*CYAN, round(90 * amount)), width=3)
    return frame


def scene_cta(now: float, start: float, end: float) -> Image.Image:
    local = clamp((now - start) / (end - start))
    frame = background(now)
    draw = ImageDraw.Draw(frame, "RGBA")
    reveal = ease_out(local / 0.35)
    size = round(78 + 22 * reveal)
    draw.text((540, 530), "POINT", font=font(size), fill=(246, 250, 252, 255), anchor="rm")
    draw.text((540, 530), "EDGE", font=font(size), fill=(*CYAN, 255), anchor="lm")
    line_w = round(720 * ease_out(clamp((local - 0.18) / 0.32)))
    draw.line((540 - line_w // 2, 660, 540 + line_w // 2, 660), fill=(*CYAN, 220), width=4)
    button = ease_out(clamp((local - 0.36) / 0.25))
    bx1, by1, bx2, by2 = 170, 850, 910, 1015
    draw.rounded_rectangle(
        (bx1, by1, bx2, by2),
        radius=48,
        fill=(*CYAN, round(235 * button)),
    )
    draw.text(
        ((bx1 + bx2) // 2, (by1 + by2) // 2),
        "POINTEDGE.PL",
        font=font(48),
        fill=(1, 10, 16, round(255 * button)),
        anchor="mm",
    )
    draw.text(
        (540, 1110),
        "Zobacz aktualną analizę",
        font=font(34),
        fill=(235, 243, 248, round(255 * button)),
        anchor="mm",
    )
    return frame


def timestamp(seconds: float) -> str:
    minutes = int(seconds // 60)
    return f"0:{minutes:02d}:{seconds % 60:05.2f}"


def ff_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:")


def write_captions() -> None:
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
Style: Caption,Bahnschrift,58,&H00FFFFFF,&H0000D9F7,&HE0000710,&H00000000,-1,0,0,0,100,100,0.5,0,1,6,2,2,72,220,285,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, text in events:
        effect = r"{\an2\pos(440,1580)\fad(70,90)\fscx94\fscy94\t(0,120,\fscx100\fscy100)}"
        lines.append(
            f"Dialogue: 8,{timestamp(start)},{timestamp(end)},Caption,,0,0,0,,{effect}{text}\n"
        )
    ASS.write_text("".join(lines), encoding="utf-8-sig")


def render_master() -> None:
    screens = {
        name: sanitized(name)
        for name in [
            "01-home.png",
            "02-method.png",
            "03-matches.png",
            "04-analysis.png",
            "05-stats.png",
        ]
    }
    total_frames = round(TOTAL * FPS)
    process = subprocess.Popen(
        [
            FFMPEG,
            "-y",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
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
            str(MASTER),
        ],
        stdin=subprocess.PIPE,
    )
    assert process.stdin is not None

    timeline = [
        (0.00, 4.90, "01", "POINTEDGE"),
        (4.90, 9.90, "02", "DANE PRZED MECZEM"),
        (9.90, 16.75, "03", "KONTEKST MECZU"),
        (16.75, 20.45, "04", "CZYTELNA ANALIZA"),
        (20.45, 24.65, "05", "MECZE ATP / WTA"),
        (24.65, 28.95, "06", "ARGUMENTY I DANE"),
        (28.95, 38.15, "07", "PUBLICZNA HISTORIA"),
        (38.15, 42.95, "08", "ANALIZA CO 72 GODZINY"),
        (42.95, 47.45, "09", "MNIEJ SZUMU. WIĘCEJ KONTEKSTU."),
        (47.45, TOTAL, "10", "POINTEDGE.PL"),
    ]

    previous: Image.Image | None = None
    for frame_index in range(total_frames):
        now = frame_index / FPS
        if now < 4.90:
            frame = scene_home(now, 0.00, 4.90, screens["01-home.png"])
        elif now < 9.90:
            frame = scene_scroll(now, 4.90, 9.90, screens["02-method.png"])
        elif now < 16.75:
            frame = scene_analysis(now, 9.90, 16.75, screens["04-analysis.png"])
        elif now < 20.45:
            frame = scene_typography(now, 16.75, 20.45, "one")
        elif now < 24.65:
            frame = scene_matches(now, 20.45, 24.65, screens["03-matches.png"])
        elif now < 28.95:
            frame = scene_typography(now, 24.65, 28.95, "data")
        elif now < 38.15:
            frame = scene_stats(now, 28.95, 38.15, screens["05-stats.png"])
        elif now < 42.95:
            frame = scene_countdown(now, 38.15, 42.95)
        elif now < 47.45:
            frame = scene_brand_statement(now, 42.95, 47.45)
        else:
            frame = scene_cta(now, 47.45, TOTAL)

        item = max(item for item in timeline if item[0] <= now)
        title_chrome(frame, item[2], item[3], now / TOTAL)

        # Very short dissolve only at scene cuts; all internal motion remains crisp.
        if previous is not None:
            cut_age = now - item[0]
            if 0 <= cut_age < 0.16:
                frame = Image.blend(previous, frame, ease(cut_age / 0.16))
        previous = frame.copy()
        process.stdin.write(frame.convert("RGBA").tobytes())

    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("Camera master encoding failed")


def finish() -> None:
    subprocess.run(
        [
            FFMPEG,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(MASTER),
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
                f"[0:v]subtitles='{ff_path(ASS)}':fontsdir='C\\:/Windows/Fonts'[v];"
                "[1:a]highpass=f=70,acompressor=threshold=-18dB:ratio=2.0:"
                "attack=8:release=90,volume=1.10[voice];"
                "[2:a]volume=0.009,lowpass=f=175,"
                "afade=t=in:st=0:d=1,afade=t=out:st=50.2:d=2.3[music];"
                "[voice][music]amix=inputs=2:duration=first,alimiter=limit=0.96[a]"
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
            str(FINAL),
        ],
        check=True,
    )


def preview() -> None:
    samples = [1, 3.7, 6.2, 9, 11, 14, 18, 22, 26, 30, 34, 37, 40, 44, 46, 49, 51.5]
    frames: list[Image.Image] = []
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
                str(FINAL),
                "-frames:v",
                "1",
                str(path),
            ],
            check=True,
        )
        frames.append(Image.open(path).convert("RGB").resize((180, 320)))
    sheet = Image.new("RGB", (180 * 6, 320 * 3), INK)
    for index, frame in enumerate(frames):
        sheet.paste(frame, ((index % 6) * 180, (index // 6) * 320))
    sheet.save(WORK / "preview-sheet-v4.jpg", quality=94)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    write_captions()
    render_master()
    finish()
    preview()
    print(FINAL)


if __name__ == "__main__":
    main()
