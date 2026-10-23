"use client";

import Image from "next/image";
import { useState } from "react";
import { metaClasses, type MetaClass } from "@/lib/cod-meta";
import styles from "./CodMeta.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function MetaBuild({ build }: { build: MetaClass }) {
  const [active, setActive] = useState<number | null>(null);
  const pending = (name: string) => name === "Da confermare";
  return <article className={styles.build} aria-labelledby={`meta-${build.id}`}>
    <header className={styles.buildHead}>
      <span className={styles.role}>{build.role}</span>
      <div>
        <p className={styles.category}>{build.category}</p>
        <h2 id={`meta-${build.id}`}>{build.weapon}</h2>
      </div>
      <span className={styles.count}>{build.attachments.length}/5 accessori</span>
    </header>
    <div className={styles.bench}>
      <div className={styles.stage}>
        <Image className={styles.weapon} src={`${basePath}${build.image}`} alt={`${build.weapon} accessoriato`} width={1024} height={576} priority={build.id === "ar"} />
        {build.attachments.map((item, index) => (
          <span key={index} className={styles.hotspot} data-active={active === index || undefined} style={{ left: `${item.x}%`, top: `${item.y}%` }} aria-hidden="true">{index + 1}</span>
        ))}
      </div>
      <ol className={styles.attachments}>
        {build.attachments.map((item, index) => (
          <li key={index} data-active={active === index || undefined} data-pending={pending(item.name) || undefined}
            tabIndex={0} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}>
            <span className={styles.slotIndex}>{index + 1}</span>
            <span><small>{item.slot}</small><strong>{item.name}</strong></span>
          </li>
        ))}
      </ol>
    </div>
    <ul className={styles.loadout} aria-label={`Equipaggiamento e perk ${build.weapon}`}>
      {build.loadout.map(item => (
        <li key={item.kind} data-pending={pending(item.name) || undefined}><small>{item.kind}</small><strong>{item.name}</strong></li>
      ))}
    </ul>
  </article>;
}

export default function CodMeta() {
  return <section className={`page-section ${styles.page}`} aria-labelledby="cod-meta-title">
    <div className={styles.hero}>
      <p className="eyebrow dark">CALL OF DUTY · MW4 · CDL</p>
      <h1 id="cod-meta-title">Classi meta</h1>
      <p>Le build ranked del momento. Passa sugli accessori per vederli sull&apos;arma.</p>
    </div>
    <div className={styles.builds}>
      {metaClasses.map(build => <MetaBuild key={build.id} build={build} />)}
    </div>
  </section>;
}
