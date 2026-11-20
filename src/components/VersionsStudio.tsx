"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Camera, GitCompareArrows, History, Plus, RotateCcw } from "lucide-react";
import { useWorkbench } from "@/context/WorkbenchContext";
import { compareProjects, validVersionDate } from "@/lib/version-history";
import { cn, Panel } from "@/components/ui";

const INPUT = "mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

export function VersionsStudio() {
  const { project, presetId, versions, storageReady, saveVersion, restoreVersion, dirty } = useWorkbench();
  const latest = versions[versions.length - 1];
  const [showForm, setShowForm] = useState(versions.length === 0);
  const [number, setNumber] = useState(latest ? latest.number + 1 : presetId === "tl27" ? 14 : 1);
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [captureSnapshot, setCaptureSnapshot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [baseId, setBaseId] = useState("");
  const selected = versions.find(version => version.id === selectedId) ?? latest;
  const previous = versions.filter(version => version.number < (selected?.number ?? 0)).at(-1);
  const base = versions.find(version => version.id === baseId) ?? previous;
  const changes = useMemo(() => base?.snapshot && selected?.snapshot
    ? compareProjects(base.snapshot, selected.snapshot) : [], [base, selected]);
  const sections = [...new Set(changes.map(change => change.section))];
  const duplicates = versions.some(version => version.number === number);

  function addVersion(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!Number.isSafeInteger(number) || number < 1 || duplicates || !validVersionDate(date) || !title.trim() || !summary.trim()) {
      setError("Benzersiz bir pozitif sürüm numarası, geçerli tarih, başlık ve değişiklik özeti girin.");
      return;
    }
    if (!saveVersion({ number, date, title, summary, captureSnapshot })) return;
    setNumber(Math.max(number, latest?.number ?? 0) + 1);
    setTitle("");
    setSummary("");
    setSelectedId("");
    setBaseId("");
    setError(null);
    setShowForm(false);
    setNotice(`v${number} sürüm geçmişine kaydedildi.`);
  }

  function restoreSelected() {
    if (!selected?.snapshot) return;
    if (dirty && !confirm("Açık tasarımda kaydedilmemiş değişiklikler var. Bu sürümün tasarımını açmak istiyor musunuz?")) return;
    restoreVersion(selected.id);
    setNotice(`v${selected.number} çalışma taslağına açıldı. Düzenleyip yeni bir sürüm olarak kaydedebilirsiniz.`);
  }

  return (
    <div className="space-y-4">
      <Panel eyebrow="Proje geçmişi" title="Sürümler" action={
        <button type="button" className={BUTTON} onClick={() => setShowForm(value => !value)} disabled={!storageReady}>
          <Plus size={14} /> {showForm ? "Formu kapat" : "Sürüm ekle"}
        </button>
      }>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
          {project.name} için hangi sürümde ne değiştiğini kaydedin. İki sürümün notlarını ve tasarım değerlerini yan yana inceleyin.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-lg border border-white/10 px-3 py-2 text-slate-300">{versions.length} kayıtlı sürüm</span>
          <span className="rounded-lg border border-white/10 px-3 py-2 text-amber-200">En yüksek sürüm {latest ? `v${latest.number}` : "henüz yok"}</span>
          <span className="rounded-lg border border-white/10 px-3 py-2 text-slate-400">{versions.filter(version => version.snapshot).length} tasarım görüntüsü</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">Geçmiş bu tarayıcıda saklanır. Üst çubuktaki JSON İndir ile açık tasarımı ve tüm sürümlerini yedekleyebilirsiniz.</p>
      </Panel>

      {notice ? <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p> : null}

      {showForm ? (
        <Panel eyebrow="Yeni kayıt" title="Bir sürümü belgele">
          <form onSubmit={addVersion} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[120px_180px_1fr]">
              <label className="text-xs text-slate-400">Sürüm numarası
                <input aria-label="Sürüm numarası" className={INPUT} type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required value={number} onChange={event => setNumber(Number(event.target.value))} />
              </label>
              <label className="text-xs text-slate-400">Sürüm tarihi
                <input className={INPUT} type="date" min="0001-01-01" max="9999-12-31" required value={date} onChange={event => setDate(event.target.value)} />
              </label>
              <label className="text-xs text-slate-400 sm:col-span-2 lg:col-span-1">Başlık
                <input className={INPUT} required maxLength={160} placeholder="Örn. LTE beslemesi ve CAN koruması" value={title} onChange={event => setTitle(event.target.value)} />
              </label>
            </div>
            <label className="block text-xs text-slate-400">Değişiklik özeti
              <textarea className={cn(INPUT, "min-h-28 resize-y")} required maxLength={10000} placeholder={"Bu sürümde neler değişti?\nÖrn. 3,8 V rayına ek bulk kapasite eklendi. CAN giriş koruması güncellendi."} value={summary} onChange={event => setSummary(event.target.value)} />
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-white/10 px-3 py-3 text-sm text-slate-300">
              <input type="checkbox" className="mt-0.5 accent-amber-400" checked={captureSnapshot} onChange={event => setCaptureSnapshot(event.target.checked)} />
              <span>Güncel tasarımın anlık görüntüsünü ekle
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">Eski bir kart revizyonunu yalnızca notlarıyla kaydederken bu seçimi kaldırın. Tasarım görüntüsü olan sürümlerin alan bazında farkları hesaplanır.</span>
              </span>
            </label>
            {duplicates ? <p role="alert" className="text-xs text-red-300">v{number} zaten kayıtlı. Başka bir numara seçin.</p> : null}
            {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!storageReady || duplicates} className={BUTTON}>Sürümü kaydet</button>
              <p className="text-xs text-slate-500">Eski sürümleri istediğiniz sırada ekleyebilirsiniz. Liste sürüm numarasına göre sıralanır.</p>
            </div>
          </form>
        </Panel>
      ) : null}

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 px-6 py-12 text-center">
          <History size={28} className="mx-auto text-amber-300" />
          <h3 className="mt-4 text-lg text-slate-100">Bu projenin sürüm geçmişini başlatın</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">Mevcut kartınızı v14 olarak kaydedebilir, önceki v1–v13 revizyonlarını tarih ve özetleriyle sonradan ekleyebilirsiniz.</p>
        </div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <div className="space-y-2" aria-label="Sürüm geçmişi">
            {[...versions].reverse().map(version => (
              <button key={version.id} type="button" onClick={() => { setSelectedId(version.id); setBaseId(""); setNotice(null); }}
                className={cn("w-full rounded-xl border px-4 py-4 text-left", selected?.id === version.id ? "border-amber-400/40 bg-amber-500/[0.07]" : "border-white/[0.08] bg-[#0c1118] hover:border-white/20")}>
                <span className="flex items-center justify-between gap-3"><span className="font-mono text-lg text-amber-200">v{version.number}</span><span className="text-[11px] text-slate-500">{displayDate(version.date)}</span></span>
                <span className="mt-2 block break-words text-sm text-slate-100">{version.title}</span>
                <span className="mt-1 line-clamp-2 block whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-400">{version.summary}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate-500">{version.snapshot ? <Camera size={12} /> : <History size={12} />}{version.snapshot ? "Tasarım görüntüsü" : "Sürüm notu"}</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 space-y-4">
            {selected ? (
              <Panel eyebrow={`v${selected.number} · ${displayDate(selected.date)}`} title={selected.title} action={selected.snapshot ?
                <button className={BUTTON} type="button" onClick={restoreSelected}><RotateCcw size={13} /> Tasarımı aç</button> : undefined}>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">{selected.summary}</p>
                <p className="mt-3 text-xs text-slate-500">{selected.snapshot ? "Bu kayıtta tasarım değerleri de saklanıyor." : "Bu kayıt, tarih ve sürüm notlarından oluşuyor."}</p>
              </Panel>
            ) : null}
            <Panel eyebrow="Karşılaştırma" title="İki sürüm arasında ne değişti?">
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <label className="text-xs text-slate-400">Önceki sürüm
                  <select className={INPUT} value={base?.id ?? ""} onChange={event => setBaseId(event.target.value)}>
                    <option value="" disabled>Sürüm seçin</option>
                    {versions.map(version => <option key={version.id} value={version.id}>v{version.number} · {version.title}</option>)}
                  </select>
                </label>
                <ArrowRight size={16} className="mb-3 hidden text-slate-500 sm:block" />
                <label className="text-xs text-slate-400">Sonraki sürüm
                  <select className={INPUT} value={selected?.id ?? ""} onChange={event => setSelectedId(event.target.value)}>
                    {versions.map(version => <option key={version.id} value={version.id}>v{version.number} · {version.title}</option>)}
                  </select>
                </label>
              </div>
              {base && selected && base.id !== selected.id ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[base, selected].map(version => <div key={version.id} className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="font-mono text-xs text-amber-200">v{version.number} · {displayDate(version.date)}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{version.summary}</p>
                  </div>)}
                </div>
              ) : null}
              {!base ? <p className="mt-4 text-sm text-slate-400">Karşılaştırma için ikinci bir sürüm ekleyin veya listeden başka bir sürüm seçin.</p>
                : base.id === selected?.id ? <p className="mt-4 text-sm text-slate-400">İki farklı sürüm seçin.</p>
                : !base.snapshot || !selected?.snapshot ? <p className="mt-4 text-sm leading-relaxed text-slate-400">Yukarıda iki sürümün notlarını karşılaştırabilirsiniz. Alan bazında farklar için iki kayıtta da tasarım görüntüsü gerekir.</p>
                : <div className="mt-5 space-y-4">
                  <p className="flex items-center gap-2 text-sm text-slate-300"><GitCompareArrows size={16} className="text-cyan-300" />{changes.length} alan değişti · {sections.length} bölüm</p>
                  {changes.length === 0 ? <p className="text-xs text-slate-500">Kaydedilen tasarım değerleri aynı. Sürüm notları yukarıda gösteriliyor.</p> : null}
                  {sections.map(section => <section key={section} className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">{section}</h3>
                    {changes.filter(change => change.section === section).map(change => <div key={change.field} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                      <p className="break-words text-xs text-slate-400">{change.label}</p>
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <p className="break-words text-rose-200"><span className="mr-2 text-[11px] text-slate-500">v{base.number}</span>{change.before}</p>
                        <p className="break-words text-emerald-200"><span className="mr-2 text-[11px] text-slate-500">v{selected.number}</span>{change.after}</p>
                      </div>
                    </div>)}
                  </section>)}
                </div>}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
