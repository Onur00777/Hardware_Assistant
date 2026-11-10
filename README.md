# HardwarePowerStudio

Formula Student araçlarının düşük gerilim (GLV) elektroniği için tarayıcı tabanlı tasarım çalışma alanı. Bir kartın güç ağacını kurun, akım ve ısıl sınırlarını inceleyin, ardından sonuçları LTspice, Altium Designer veya tasarım incelemesi için dışa aktarın.

[Kurulum](#kurulum) · [Kullanım](#kullanım) · [Hesaplama araçları](#hesaplama-araçları) · [Dışa aktarma](#dışa-aktarma) · [Geliştirme](#geliştirme)

## Kurulum

Gereksinimler **Node.js 20 veya üzeri** ve **npm**. Yerel kurulumda ortam değişkeni gerekmez.

```bash
git clone https://github.com/Onur00777/Hardware_Assistant.git
cd Hardware_Assistant
npm ci
npm run dev
```

Tarayıcıda [http://localhost:3000](http://localhost:3000) adresini açın. Uygulama **TL27 DAQ & Telemetry** profiliyle, **Power tree** ekranında açılır.

## Kullanım

1. Üst çubuktan bir kart profili seçin veya **Yeni Proje** ile temel güç rayları ve örnek MCU yükü içeren bir çalışma alanı oluşturun.
2. **Power tree** ekranında rayları, bağlı yükleri, akımları ve görev döngülerini düzenleyin. **Idle**, **Active**, **Mission** ve **Peak** senaryoları arasında geçerek kaynak bütçesini karşılaştırın.
3. Güç grafiğindeki bir düğüme tıklayarak ilgili hesaplama ekranını açın. Kırmızı düğümler, örneğin regülatör sıcaklık sınırı, LTE beslemesinde gerilim çökmesi veya TVS koruma marjı gibi modelin tespit ettiği sorunları gösterir.
4. **Design gate** ekranında kontrolleri gözden geçirin. **Pass** kontrolün geçtiğini, **Watch** izlenmesi gereken bir marjı, **Fail** ise bir model sınırının aşıldığını veya geçerli bir çözüm bulunamadığını gösterir. **Copy verdict** ile kontrol özetini kopyalayabilirsiniz.
5. **Kaydet** ile çalışma alanını tarayıcının yerel depolamasına yazın. Yedek almak veya projeyi başka bir tarayıcıya taşımak için **JSON İndir** ve **JSON Yükle** düğmelerini kullanın.

### Kart profilleri

- **TL27 DAQ & Telemetry** · Varsayılan profil. STM32H745, çift CAN FD ve Quectel LTE. 24 V kaynaktan iki LMR14030 ile 5 V ve 3,8 V üretilir. 3,3 V MCU rayı 5 V üzerinden AMS1117 ile beslenir.
- **IST27 VCU Board** · STM32H745, çift izole CAN, üst taraf sürücüleri ve APPS ile fren basıncı girişleri.
- **IST27 Telemetry & Datalogger** · STM32H743, Quectel LTE Cat-1, GNSS, SDMMC ve IMU. Regülatör analizi 3,8 V modem rayına odaklanır.
- **Combined Stress Fault Case** · SOT-23 ısıl sınırı, sönümsüz giriş filtresi ve yetersiz LTE kapasitesi gibi sorunları görünür kılan örnek profil.

## Hesaplama araçları

- **Power tree** · Ray bazında ortalama, RMS ve eşzamanlı tepe akımı, dönüştürücü kayıpları, kaynak sigortası ve bakır iz genişliği. Güç grafiği kaynak, koruma, regülatör ve yük ilişkilerini gösterir. [Hesaplama](src/lib/engineering/power.ts) · [Grafik modeli](src/lib/power-topology.ts)
- **Regulator** · LDO veya buck için kayıp, verim ve jonksiyon sıcaklığı. Aynı ekranda bobin dalgalanması, doyum marjı, çekirdek kaybı ve MLCC’nin DC bias altında etkin kapasitesi hesaplanır. [Regülatör](src/lib/engineering/regulator.ts) · [Manyetikler ve MLCC](src/lib/engineering/magnetics.ts)
- **Bulk cap** · LTE/GSM akım darbesinde minimum besleme gerilimi, ESR bütçesi, gerekli etkin kapasite ve katalogdan polimer ile MLCC ağ önerisi. [Hesaplama](src/lib/engineering/capacitance.ts)
- **Protection** · Ters polarite yolu kaybı, TVS standoff ve clamp marjları, bobin enerjisi ve LC giriş filtresi için Middlebrook oranı. [Hesaplama](src/lib/engineering/protection.ts)
- **Harness** · Kablo gerilim düşümü, sürekli akım ve ilk akım darbesinde üst taraf anahtarının sıcaklığı, sigorta ile kablonun I²t koordinasyonu. [Hesaplama](src/lib/engineering/harness.ts)
- **PCB** · İç ve dış katman iz genişliği, via akımı ve ısıl via dizisi, JLCPCB katman profilleri için mikroşerit, CPW ve diferansiyel empedans tahminleri. [PCB modeli](src/lib/engineering/pcb.ts) · [IPC-2152 yaklaşımı](src/lib/engineering/ipc2152.ts)
- **Analog** · E24 veya E96 gerilim bölücü, STM32 ADC örnekleme kondansatörünün yük paylaşımı ve yerleşme hatası, Beta ve Steinhart–Hart ile NTC eğrisi. [Hesaplama](src/lib/engineering/analog.ts)
- **CAN bus** · STM32 FDCAN ve bxCAN nominal bit zamanlaması, örnekleme noktası, sonlandırma ve hat ile dal uzunluğu bütçesi. [Hesaplama](src/lib/engineering/can.ts)
- **Design gate** · Sigorta yükü, güç dengesi, regülatör sıcaklığı, brownout, filtre oranı, kablo ve PCB sonuçları, ADC ve CAN zamanlaması gibi kontrolleri tek ekranda toplar. [Kontrol eşikleri](src/lib/design-gate.ts)

<details>
<summary>Model varsayımları ve örnek denklemler</summary>

- **Güç bütçesi.** Görev oranı `D` olan tek dikdörtgen yük için ortalama akım `I·D`, RMS akım `I·√D` olur. Birleşik RMS hesabı bağımsız darbeler varsayar. Eşzamanlı tepe ayrıca hesaplanır. Buck giriş akımı `Iout·Vout/(Vin·η) + Iq` ile üst raya taşınır. Kaynak sigortası için hedef, görev senaryosundaki RMS akımın nominal sigorta akımının %75’ini geçmemesidir.
- **Isıl hesap.** LDO kaybı `(Vin − Vout)·Iout + Vin·Iq`, jonksiyon sıcaklığı `Ta + Ploss·θJA` ile tahmin edilir. Buck modelinde anahtarlama, iletim, ölü zaman ve sürücü kayıpları hesaplanır. Bobinin DCR kaybı paket sıcaklığı hesabının dışında tutulur. Bobin çekirdek kaybında iGSE yaklaşımı kullanılır.
- **Giriş filtresi.** 100 Hz–10 MHz taramasında tepe `|Zout|/|Zin|` oranı için modelin hedefi 0,1’in altıdır. Önerilen seri RC sönümleme kolunda `Rd = √(L/C)` ve `Cd = 4·C` alınır.
- **Darbe yükü.** Kapasitör gerilimi `Vnom − Icap·ESR − Q/C` ile izlenir. Regülatör akımı, girilen tepki süresine göre yük akımına yaklaşır. Minimum kapasite, darbe boyunca gerilimi brownout eşiğinde veya üzerinde tutacak şekilde aranır.
- **PCB ve kablo.** İz sıcaklık artışı `ΔT = K·I^a·W^b·Th^c` biçimindeki IPC-2152 regresyonuyla tahmin edilir. Via ısıl direnci, kaplamanın bakır kesiti üzerinden hesaplanır. Kablonun adyabatik kısa devre sınırı `I²t = (k·S)²` ile modellenir.
- **ADC ve CAN.** ADC’de yük paylaşımı ve örnekleme penceresindeki yerleşme ayrı hesaplanır. CAN zamanlamasında saat bölücüsü ve zaman kuantaları, hedef bit hızı ve örnekleme noktası için taranır.

</details>

## Dışa aktarma

**Export** ekranı açık projeden şu dosyaları üretir.

- **LTspice** · `hardware-power.cir`, giriş filtresi ve LTE darbesi için `.tran 5m` netlist’i. `hardware-power.asc` eşlik eden şemadır.
- **Altium Designer** · `altium-rules.csv`, `HardwarePowerStudio_Rules.pas` ve `HardwarePowerStudio_Rules.js`. Ray genişlikleri, CAN 120 Ω ve USB 90 Ω diferansiyel çift geometrileri ile bileşen ve 24 V bakır açıklığı kurallarını içerir.
- **Güç katı BOM’u** · `power-bom.csv`, sabit katalog satırlarını proje ayarlarından gelen TVS, bobin ve kapasitör seçimleriyle birleştirir. Satın alma öncesinde kalemleri şematikle karşılaştırın.
- **Tasarım incelemesi** · `design-review.md` ve `design-review.html`. HTML dosyası tarayıcının yazdırma menüsünden PDF olarak kaydedilebilir.

### Altium Designer betikleri

PCB belgesini açın ve Altium’un **DXP → Run Script** menüsünden oluşturulan DelphiScript veya JavaScript dosyasındaki `HWPS_ImportRules` giriş noktasını çalıştırın.

Betiğin kullandığı güç sınıfları `PWR_24V`, `PWR_5V`, `PWR_3V8_LTE` ve `PWR_3V3`, diferansiyel çift sınıfları ise `CAN_120R` ve `USB_90R` adlarını taşır. Aktarımdan sonra sınıf üyeliklerini PCB’de kontrol edin. Aynı betiği yeniden çalıştırdığınızda aynı adlı `HWPS_` kuralları güncellenir.

Güç izi genişlikleri, standart ray kimliklerinin (`glv`, `rail5`, `rail3v8`, `rail3v3`) **Mission** RMS akımlarını ve **PCB** ekranındaki bakır ağırlığı ile sıcaklık artışı hedefini kullanır. Her sınıf için bir alt akım sınırı uygulanır. Özel raylar için Altium’daki kapsamı ve genişlikleri kartınıza göre kontrol edin.

### Yerel API

Her iki uçta da **GET** temel Formula Student profilini kullanır. **POST** için **JSON İndir** ile kaydettiğiniz proje dosyasını istek gövdesi olarak gönderin.

- `/api/altium/export-rules` · Betik kaynakları, CSV ve yapılandırılmış kural verileri.
- `/api/altium/sync-bom` · BOM satırları ve CSV içeriği.

```bash
curl.exe -fsS http://localhost:3000/api/altium/export-rules
curl.exe -fsS http://localhost:3000/api/altium/sync-bom -H "Content-Type: application/json" --data-binary "@project.json"
```

Örnekteki `project.json` adını indirdiğiniz dosyanın adıyla değiştirin. macOS ve Linux’ta `curl.exe` yerine `curl` kullanın.

## Geliştirme

Uygulama Next.js App Router, React ve TypeScript kullanır. Arayüz Tailwind CSS, güç grafiği React Flow, hesaplama grafikleri Recharts ile oluşturulur. Etkileşimli hesaplamalar tarayıcıda çalışır. Yerel Next.js API uçları dış araçların aynı hesaplama ve dışa aktarma modüllerini kullanmasını sağlar.

```bash
npm run check:math   # Sayısal kontroller ve dışa aktarma kontrolleri
npm run lint         # ESLint
npm run build        # Üretim derlemesi
npm run start        # Üretim derlemesini yerelde çalıştır
```

- [`src/components/`](src/components) · Hesaplama ekranları, çalışma alanı çubuğu ve güç grafiği.
- [`WorkbenchContext.tsx`](src/context/WorkbenchContext.tsx) · Proje durumu, tarayıcı kayıtları ve hesaplamaların güncellenmesi.
- [`src/lib/engineering/`](src/lib/engineering) · Hesaplama modülleri ve [sayısal kontrol betiği](src/lib/engineering/self-check.ts).
- [`preset.ts`](src/lib/preset.ts) ve [`components-db.ts`](src/lib/components-db.ts) · Kart profilleri ve güç bileşeni kataloğu.
- [`exporters.ts`](src/lib/exporters.ts), [`altium-script.ts`](src/lib/altium-script.ts) ve [`src/app/api/altium/`](src/app/api/altium) · Dosya üretimi ve yerel API.

### Hesap sonuçlarını yorumlama

Sonuçlar ön boyutlandırma ve tasarım incelemesi içindir. Güç ağacı girilen buck verimini kullanır. Ayrıntılı kayıp modeli, **Regulator** ekranında seçilen tek dönüştürücüye uygulanır. Kartı üretime almadan önce paket sıcaklık direncini, TVS clamp değerini, sigortanın I²t eğrisini ve MLCC’nin gerilim altındaki kapasitesini seçilen parçaların veri sayfalarıyla karşılaştırın. İz geometrisi ve empedans için üreticinin gerçek katman yapısını, kritik çalışma noktaları için prototip ölçümlerini kullanın.
