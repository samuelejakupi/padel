# Dalle immagini laterali delle armi (PNG trasparenti in scripts/weapon-sources,
# prese da wzstats.gg) genera per ogni arma in public/gaming/loadouts/weapons:
# - <id>.png: 1024x1024 trasparente, arma quasi monocromatica, contorno ciano
#   sottile e glow leggero;
# - <id>.svg: la sagoma, un solo tracciato pieno, ricavata dalla trasparenza.
# Uso: python3 scripts/weapon-icons.py   (servono pillow, numpy, opencv, potracer)
import pathlib, cv2, numpy as np, potrace
from PIL import Image, ImageFilter, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/weapon-sources"
OUT = ROOT / "public/gaming/loadouts/weapons"
CYAN = (24, 223, 228)
SIZE, MARGIN = 1024, 70

for path in sorted(SRC.glob("*.png")):
    im = Image.open(path).convert("RGBA")
    im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox())
    scale = (SIZE - 2 * MARGIN) / max(im.size)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    alpha = im.getchannel("A")
    # Quasi monocromatica: luminanza schiarita, cosi i dettagli restano ma
    # l'arma si legge chiara sul fondo scuro.
    gray = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1).point(lambda v: int(95 + v * 0.62))
    body = Image.merge("RGBA", (gray, gray, gray, alpha))
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    at = ((SIZE - im.width) // 2, (SIZE - im.height) // 2)
    hard = Image.new("L", (SIZE, SIZE)); hard.paste(alpha.point(lambda a: 255 if a > 100 else 0), at)
    glow = hard.filter(ImageFilter.GaussianBlur(14)).point(lambda a: int(a * 0.55))
    outline = hard.filter(ImageFilter.MaxFilter(5))
    canvas.paste(Image.new("RGBA", (SIZE, SIZE), CYAN + (255,)), (0, 0), glow)
    canvas.paste(Image.new("RGBA", (SIZE, SIZE), CYAN + (255,)), (0, 0), outline)
    canvas.alpha_composite(body, at)
    canvas.save(OUT / f"{path.stem}.png", optimize=True)

    # Sagoma: la trasparenza ripulita e ricalcata. potracer considera
    # "pieno" il valore falso, quindi la maschera va invertita.
    mask = np.array(alpha) > 100
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
    h, w = mask.shape
    f = lambda p: "%g %g" % (round(p.x, 1), round(p.y, 1))
    d = []
    for c in potrace.Bitmap(~mask).trace(turdsize=30, alphamax=1.0, opticurve=True, opttolerance=0.4):
        d.append("M" + f(c.start_point))
        for s in c.segments:
            d.append(("C" + f(s.c1) + " " + f(s.c2) + " " + f(s.end_point)) if not s.is_corner else ("L" + f(s.c) + "L" + f(s.end_point)))
        d.append("Z")
    (OUT / f"{path.stem}.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><path fill="#d3dbe1" fill-rule="evenodd" d="{"".join(d)}"/></svg>\n')
    print(path.stem, (OUT / f"{path.stem}.png").stat().st_size // 1024, "KB png,", (OUT / f"{path.stem}.svg").stat().st_size // 1024, "KB svg")
