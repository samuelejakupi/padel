import type { AttachmentSlot, WeaponCategory } from "./types";

// Elenchi presi da codmunity.gg e wzstats.gg il 23 ottobre 2026: tutte le
// armi di MW4 e, per le armi della pagina, gli accessori che il gioco offre
// slot per slot. Servono al modulo "Aggiungi build" per suggerire i nomi
// giusti; le build vere sono in data.ts.

export const mw4Weapons: { name: string; category: WeaponCategory }[] = [
  ...["M4", "HAN 86", "Kastov 762", "Hyeon Burst", "Axion", "Cronen Squall", "Oden", "Patriot XMR"].map(name => ({ name, category: "assault" as const })),
  ...["ISO Nightshade", "VEL 46", "PPSh-41", "X-58 NYX", "Wz.55 Striga"].map(name => ({ name, category: "smg" as const })),
  ...["REZI 12", "Warlord"].map(name => ({ name, category: "shotgun" as const })),
  ...["TYPE 73", "FINN LMG", "APOC-338"].map(name => ({ name, category: "lmg" as const })),
  ...["ORIS 8.6", "MAR-9", "Mosin-Nagant"].map(name => ({ name, category: "marksman" as const })),
  ...["KG-7 Vulcan", "SIGNAL 50", "Astaroth .57"].map(name => ({ name, category: "sniper" as const })),
  ...["Krait P68", ".50 GS", "SANG 9mm", "Mojave .357"].map(name => ({ name, category: "pistol" as const })),
];

const lasers = ["SA Laz-500", "SZ Gen.6 PEQ", "Bruen 22-LPW", "Corio 4DV-3", "Corio ODSPR+", "Expedite Intra-5b", "STOVL IRX-6"];
const lasersB = ["XRK Clutch-LS", "Schlager VISIV-5", "Expedite 21 CFR", "Expedite Squad-304", "FJX EVR7", "Pulse-MW", "QFL-S4.5"];
const optics = ["ZLR Type C", "IOTA-D", "KV Corsac Holo", "Slimline Elite", "SZ Prima-4 Dot"];
const ammo = ["Overpressured", "Armor Piercing", "Frangible", "High Velocity", "Hollow Point"];
const arMuzzles = ["FSS IS300", "XRK Mil-Tac Suppressor", "B16 Helical", "Corvus LVL-40", "FSS IS40", "FTAC Dominion", "TZL-110 V1", "ZLR Reverb90"];

export const attachmentOptions: Record<string, Partial<Record<AttachmentSlot, string[]>>> = {
  "m4": {
    muzzle: arMuzzles,
    barrel: ["18\" LE Crosswind", "11.5\" Shortline", "16\" Highmark", "FT Cannonade 7\"", "ZLR Drift 16.5\""],
    laser: lasers, optic: optics,
    stock: ["PF1 Fixed Stock", "Hurricane Stock", "ZLR ASP50 Stock", "Demo Dozer Stock", "Demo HVR2", "No Stock"],
    underbarrel: ["FSS Fireline Grip", "AA54 V.3 Bipod", "FSS Beargrip", "FSS Tac90 Grip", "GW Domi-9", "Hurricane Grip", "Mire-50 Tac Grip", "TV Judicator", "Underbarrel Grenade Launcher"],
    magazine: ["60 Round Drum", "45 Round Mag"],
    rearGrip: ["ZLR Phase Grip", "Brace DX Grip", "Schlager STB"],
    ammo, apex: ["M4 Hurricane"],
  },
  "han-86": {
    muzzle: arMuzzles,
    barrel: ["SA H86 465mm", "Hanbit Lightning-7 465mm", "HAN 86 Silenced 413mm", "Hanbit RK8 406mm", "Hanbit Combat-S 264mm", "SA K556 16\""],
    laser: lasersB, optic: optics,
    stock: ["Meiko L9P-Fold", "FR4 Retractable", "EXP Umbral Pro 7", "XRK Firewrath"],
    underbarrel: ["FSS Tac90 Grip", "FSS Fireline Grip", "AA54 Bipod", "FSS Beargrip", "GW Domi-9", "Mire-50", "Miri 40mm", "TV Judicator"],
    magazine: ["60 Round Drum", "45 Round Mag"],
    rearGrip: ["XRK Justice II Grip", "FTAC Griplord 80", "Hanbit H86 Grip"],
    ammo: ["5.56 NATO AP", "Frangible", "High Velocity", "Hollow Point", "Overpressured"], apex: ["Han X20 Skybreaker"],
  },
  "vel-46": {
    muzzle: ["XRK Herder 40", "Demo Ironshade", "FSS Crackdown", "212 LC40 Comp", "Haebang ORC70", "Hanbit Chevron", "TA Lightning R3M", "TA TacPro-56"],
    barrel: ["VB-46 Series 11", "RV-B v2", "XRK Tango 380"],
    underbarrel: ["FSS Fireline Grip", "FSS Tac90 Grip", "GW Domi-9", "V46 Vert-Tac"],
    rearGrip: ["V46 R-Skel Grip", "LM Combat Grip", "Sakin Rubber Grip"],
    stock: ["VEL 46 Extended", "EXP Defiant", "EXP Lockdown", "EXP U-Turn"],
    laser: lasersB, optic: optics,
    magazine: ["60 Round Drum", "30 Round Mag"],
    ammo, apex: ["VEL 46 Snap"],
  },
  "rezi-12": {
    muzzle: ["FTAC LTS-707", "EXP Firelite 12", "GW Slashtop V1", "Haebang Bulsae-10", "Mugi-X VIR0", "Sakin Omega 13", "SA One Tap", "TA Ribcage Gen.1", "XRK Spine Ripper"],
    barrel: ["ZLR Rogue 90 25\"", "Haebang 635R-7", "ZLR 12GA Ported 21\"", "ZLR L48 Siege 13\""],
    rearGrip: ["XRK Bygone-39", "Bruen R12-SH", "POM12-F", "SA B40"],
    stock: ["ZLR Tac12 Pro", "No Stock", "EXP FR67-U0", "TV XR-14 Kilo"],
    laser: lasersB, optic: optics,
    underbarrel: ["FSS Fireline Grip", "FSS Tac90 Grip", "GW Domi-9", "Mire-50"],
    comb: ["Bryson Sidewinder", "LM Stock Sleeve", "Sakin V14 Tactical"],
    bolt: ["XRK Quad-80", "ZLR Competition-B6", "U12G Match 9"],
    guard: ["Demo Service-12G", "Rushline L-WATT20", "XRK Warlord 700"],
    ammo: ["12 Gauge Slug"], apex: ["Rezi 12 Enforcer"],
  },
  "kg-7-vulcan": {
    muzzle: ["Ivanov QR600", "TT Solgae F7", "770 Underbite", "DS RKT-90", "EXP R3000-V", "Field Tac 1.4 Comp", "FT Hyperport 408", "Gauge-12 Mono", "Usenko 308-1L"],
    barrel: ["TT Baem 12\"", "Haebang RMT762 29\"", "Haebang Naseon v.5 26\"", "TT X541-2 26\""],
    optic: ["Schlager 7x", ...optics],
    comb: ["TT Type 40", "Haebang YNC-45", "Hanbit CHK-1"],
    bolt: ["KT76 Light Bolt", "Twist76 Heavy Bolt"],
    stock: ["Bruen KG-7 Mk. IV", "Hanbit RTR Mk. I", "TT G76-RP"],
    laser: ["Expedite 21 CFR", "FJX EVR7", "Schlager VISIV-5", "XRK Clutch-LS"],
    underbarrel: ["KG-7 Bipod"],
    magazine: ["6 Round Mag", "15 Round Mag"],
    ammo: ["7.62x54mmR High Velocity", "Armor Piercing", "Frangible", "Hollow Point", "Overpressured"], apex: ["KG-7 Drillcharge"],
  },
  "finn-lmg": {
    muzzle: ["XRK Mil-Tac Suppressor", "FSS IS300", "FTAC Dominion", "TA Lodestar 556", "EXP V-TAC Suppressor", "B16 Helical", "Corvus LVL-40", "ZLR Reverb90"],
    barrel: ["TA Sustain-99 20\"", "FTAC MOD3-LK 15\"", "TT Seongun 508mm", "TA N-VCX 18\""],
    underbarrel: ["Bruen Renegade", "FTAC Combat Grip", "AA54 Bipod"],
    laser: lasers, optic: optics,
    stock: ["EXP Bulldog-9", "Hanbit Kumiho Gripset", "Hanbit Tech50 Gen.5", "No Stock"],
    rearGrip: ["XRK Singularity-13", "Schlager KM60-G", "FTAC R7 Wrap"],
    magazine: ["75 Round Box", "150 Round Box"],
    // codmunity elenca cinque munizioni 5.56 NATO senza nome completo: si
    // usano quelle della HAN 86, che hanno lo stesso calibro.
    ammo: ["5.56 NATO AP", "Frangible", "High Velocity", "Hollow Point", "Overpressured"], apex: ["FiNN Adverse"],
  },
};
