#!/usr/bin/env python3
"""
Adds sub_brand field to loreal_products.json derived from product name + brand.
Run after loreal_fill_brand.py completes.
"""

import json
import re

INPUT_FILE = "loreal_products.json"

# Sub-brand keyword map: (brand_fragment, name_keywords) -> sub_brand
SUBBRAND_RULES = [
    # Kerastase
    ("kerastase", ["nutritive", "bain satin", "lait vital", "nectar thermique", "masquintense", "serum oleo"], "Nutritive"),
    ("kerastase", ["resistance", "bain force architecte", "ciment anti-usure", "masque force architecte", "therapiste"], "Resistance"),
    ("kerastase", ["discipline", "bain fluidealiste", "bain oleo-relax", "masque oleo-relax", "masque fluidealiste", "oleo-curl"], "Discipline"),
    ("kerastase", ["genesis", "bain hydra-fortifiant", "masque reconstituant", "serum anti-chute", "fortifiant"], "Genesis"),
    ("kerastase", ["blond absolu", "bain lumiere", "masque cicaextreme", "cicaplasme", "serum cicanuit"], "Blond Absolu"),
    ("kerastase", ["chronologiste", "bain revitalisant", "masque revitalisant", "huile"], "Chronologiste"),
    ("kerastase", ["densifique", "bain densite", "masque densite", "serum densite", "mousse densifique"], "Densifique"),
    ("kerastase", ["elixir ultime"], "Elixir Ultime"),
    ("kerastase", ["curl expression", "bain micellaire", "masque essentielle", "gelée coiffante"], "Curl Expression"),
    ("kerastase", ["premiere", "decalcifying"], "Premiere"),
    ("kerastase", ["fusio-dose", "fusio dose"], "Fusio-Dose"),
    ("kerastase", ["aura botanica"], "Aura Botanica"),
    ("kerastase", ["initialiste"], "Initialiste"),
    ("kerastase", ["specifique", "bain antipelliculaire", "masque hydra-apaisant"], "Specifique"),
    ("kerastase", ["8hr magic", "night serum"], "Nutritive"),

    # L'Oreal Professionnel
    ("loreal", ["absolut repair", "gold quinoa"], "Absolut Repair"),
    ("loreal", ["vitamino color", "vitamino-color"], "Vitamino Color"),
    ("loreal", ["liss unlimited", "liss"], "Liss Unlimited"),
    ("loreal", ["pro longer"], "Pro Longer"),
    ("loreal", ["inforcer"], "Inforcer"),
    ("loreal", ["volumetry"], "Volumetry"),
    ("loreal", ["blond studio"], "Blond Studio"),
    ("loreal", ["dia light"], "Dia Light"),
    ("loreal", ["dia color"], "Dia Color"),
    ("loreal", ["steampod"], "Steampod"),
    ("loreal", ["x-tenso", "xtenso"], "X-tenso"),
    ("loreal", ["tecni.art", "tecni art", "morning after dust", "beach waves", "air fix", "next day hair"], "Tecni.Art"),
    ("loreal", ["mythic oil"], "Mythic Oil"),
    ("loreal", ["silver"], "Silver"),
    ("loreal", ["curl expression", "curl"], "Curl Expression"),
    ("loreal", ["metal detox"], "Metal Detox"),
    ("loreal", ["scalp advanced", "scalp"], "Scalp Advanced"),
    ("loreal", ["serie expert"], "Serie Expert"),

    # Redken
    ("redken", ["all soft", "argan-6 oil"], "All Soft"),
    ("redken", ["color extend", "magnetics", "blondage"], "Color Extend"),
    ("redken", ["extreme", "cat protein"], "Extreme"),
    ("redken", ["frizz dismiss"], "Frizz Dismiss"),
    ("redken", ["acidic bonding"], "Acidic Bonding"),
    ("redken", ["volume injection"], "Volume Injection"),
    ("redken", ["nature + science", "nature+science"], "Nature + Science"),
    ("redken", ["one united"], "One United"),
]


def detect_subbrand(name: str, brand: str | None) -> str | None:
    if not name:
        return None
    name_lower = name.lower()
    brand_lower = (brand or "").lower()

    for brand_frag, keywords, subbrand in SUBBRAND_RULES:
        if brand_frag not in brand_lower and brand_frag not in name_lower:
            continue
        if any(kw in name_lower for kw in keywords):
            return subbrand

    return None


def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        products = json.load(f)

    updated = 0
    for product in products:
        sb = detect_subbrand(product.get("name", ""), product.get("brand", ""))
        if sb and product.get("sub_brand") != sb:
            product["sub_brand"] = sb
            updated += 1
        elif not sb and "sub_brand" not in product:
            product["sub_brand"] = None

    with open(INPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print(f"✅ Done! sub_brand set for {updated} products")

    # Summary
    from collections import Counter
    counts = Counter(p.get("sub_brand") for p in products if p.get("sub_brand"))
    print("\nSub-brands found:")
    for name, count in counts.most_common():
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()
