"use client";

import { Download, FileUp, FolderPlus, Plus, RotateCcw, Save, Trash2, Check, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useWorkbench } from "@/context/WorkbenchContext";
import { BOARD_PRESETS, type BoardPresetId } from "@/lib/preset";
import { cn } from "@/components/ui";

export function WorkspaceBar() {
  const {
    project,
    dirty,
    presetId,
    activeCustomId,
    customProjects,
    loadPreset,
    loadCustomProject,
    saveCurrentAsCustom,
    deleteCustomProject,
    createNewWorkspace,
    exportProjectJson,
    importProjectJson,
    reset
  } = useWorkbench();

  const [showNewModal, setShowNewModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [saveName, setSaveName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim() || "Yeni Donanım Kartı";
    createNewWorkspace(name);
    setNewProjectName("");
    setShowNewModal(false);
    showNotification(`"${name}" çalışma alanı oluşturuldu!`);
  };

  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    const name = saveName.trim() || project.name || "Özel Donanım Projesi";
    saveCurrentAsCustom(name);
    setShowSaveModal(false);
    showNotification(`"${name}" kaydedildi!`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = importProjectJson(content);
        if (ok) {
          showNotification("Proje JSON başarıyla içe aktarıldı!");
        } else {
          alert("Hata: Geçersiz HardwarePowerStudio proje JSON dosyası.");
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isPersonal = presetId === "tl27";

  return (
    <div className="space-y-3">
      {/* Top Banner for Onur's TL27 Project */}
      {isPersonal ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-amber-300">Onur Yüksek — TL27 DAQ & Telemetry Çalışma Alanı</span>
            <span className="hidden sm:inline text-amber-200/70">
              · Şematik Doğrulandı (LMR14030 + AMS1117 + Dual CAN-FD + Quectel LTE + 2000µF Hold)
            </span>
          </div>
          <span className="rounded bg-amber-400/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
            Özel Kartınız
          </span>
        </div>
      ) : null}

      {/* Workspace Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0c1118]/80 p-3">
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
          <label htmlFor="workspace-picker" className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            {presetId === "custom" ? "Özel Çalışma Alanı" : dirty ? "Değiştirilmiş Profil" : "Kart / Çalışma Alanı"}:
          </label>
          <select
            id="workspace-picker"
            value={presetId === "custom" ? `custom:${activeCustomId}` : presetId}
            onChange={(e) => {
              const val = e.target.value;
              if (val.startsWith("custom:")) {
                loadCustomProject(val.replace("custom:", ""));
              } else {
                loadPreset(val as BoardPresetId);
              }
            }}
            className="flex-1 max-w-xl rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
          >
            <optgroup label="⭐ Özel Çalışma Alanlarım (My Workspaces)">
              <option value="tl27">
                ⭐ TL27 DAQ & Telemetry (Onur Yüksek) — STM32H745 + Dual CAN-FD + Quectel LTE
              </option>
              {customProjects.map((cp) => (
                <option key={cp.id} value={`custom:${cp.id}`}>
                  📁 {cp.name} ({cp.updatedAt})
                </option>
              ))}
            </optgroup>
            <optgroup label="📋 Standart Şablonlar (Official Presets)">
              {BOARD_PRESETS.filter((p) => !p.isPersonal).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setNewProjectName("");
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
            title="Sıfırdan yeni bir proje ve çalışma alanı başlat"
          >
            <Plus size={13} />
            <span>Yeni Proje</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSaveName(project.name);
              setShowSaveModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/[0.08]"
            title="Mevcut projeyi tarayıcıya kaydet"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Kaydet</span>
          </button>

          <button
            type="button"
            onClick={exportProjectJson}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/[0.08]"
            title="Projeyi JSON dosyası olarak indir"
          >
            <Download size={13} />
            <span className="hidden md:inline">JSON İndir</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/[0.08]"
            title="JSON proje dosyası yükle"
          >
            <FileUp size={13} />
            <span className="hidden md:inline">JSON Yükle</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />

          {presetId === "custom" && activeCustomId ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`"${project.name}" projesini silmek istediğinize emin misiniz?`)) {
                  deleteCustomProject(activeCustomId);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
              title="Bu özel projeyi sil"
            >
              <Trash2 size={13} />
            </button>
          ) : null}

          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
            title="Projeyi varsayılana sıfırla"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Sıfırla</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notice ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 animate-fadeIn">
          <Check size={14} className="text-emerald-400" />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* New Project Modal */}
      {showNewModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0f141d] p-5 shadow-2xl">
            <h3 className="flex items-center gap-2 text-base font-medium text-slate-100">
              <FolderPlus size={18} className="text-cyan-400" />
              Yeni Donanım Çalışma Alanı Aç
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Sıfırdan temiz bir devre kartı projesi başlatın. Kendi voltaj raylarınızı, regülatörlerinizi ve yüklerinizi ekleyebilirsiniz.
            </p>
            <form onSubmit={handleCreateNew} className="mt-4 space-y-4">
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-400">Proje Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: BMS Slave Kartı / Motor Sürücü"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-400 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.05]"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/30"
                >
                  Projeyi Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Save Project Modal */}
      {showSaveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0f141d] p-5 shadow-2xl">
            <h3 className="flex items-center gap-2 text-base font-medium text-slate-100">
              <Save size={18} className="text-amber-400" />
              Çalışma Alanını Kaydet
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Mevcut değişikliklerinizi tarayıcınızın yerel depolama alanına kaydedin. İstediğiniz zaman listeden geri yükleyebilirsiniz.
            </p>
            <form onSubmit={handleSaveCurrent} className="mt-4 space-y-4">
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-400">Kayıt Adı</label>
                <input
                  type="text"
                  required
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.05]"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-3.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/30"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
