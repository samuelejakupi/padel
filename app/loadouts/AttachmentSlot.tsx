"use client";

import Image from "next/image";
import { attachmentIcon } from "@/lib/loadouts/resolve";
import { attachmentSlots, PENDING, statKeys, type Attachment, type StatKey } from "@/lib/loadouts/types";
import { RarityBadge } from "./parts";
import styles from "./Loadouts.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function AttachmentSlot({ attachment }: { attachment: Attachment }) {
  const empty = attachment.name === PENDING;
  const changes = Object.entries(attachment.modifiers) as [StatKey, number][];
  return <li className={styles.slot} data-rarity={attachment.rarity} data-empty={empty || undefined}>
    <span className={styles.slotIcon}>
      <Image src={`${basePath}${attachmentIcon(attachment)}`} alt="" width={512} height={512} />
    </span>
    <span className={styles.slotBody}>
      <small>{attachmentSlots[attachment.slot]}</small>
      <strong>{attachment.name}</strong>
      <span className={styles.slotEffect}>{attachment.effect}</span>
      {changes.length ? <span className={styles.slotMods}>
        {changes.map(([key, delta]) => <span key={key} data-sign={delta > 0 ? "up" : "down"}>{statKeys[key]} {delta > 0 ? `+${delta}` : delta}</span>)}
      </span> : null}
    </span>
    {!empty ? <RarityBadge rarity={attachment.rarity} /> : null}
  </li>;
}
