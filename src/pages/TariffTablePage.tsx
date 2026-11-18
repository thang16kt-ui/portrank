import { useState } from 'react';
import { COUNTRIES, countryName } from '../data/countries';
import { tariffLookupLink } from '../data/customsBasis';
import { runPlan } from '../lib/actions';
import { daysSince, downloadText, fmtDateVi, toCsv, todayIso } from '../lib/csv';
import { TARIFF_STALE_DAYS } from '../lib/duty';
import { TARIFF_SNAPSHOT } from '../lib/tariffSources';
import { OFFICIAL_TARIFF_SOURCES, TARIFF_CSV_FULL_HEADER, TARIFF_CSV_HEADER, parseTariffRows, tariffToRow, type TariffEntry } from '../providers/TariffProvider';
import { CURATED_CHARGES, CURATED_COUNTRIES, CURATED_LABEL, CURATED_MEASURES, CURATED_TARIFFS } from '../data/curated';
import { CHARGE_CSV_HEADER, MEASURE_CSV_HEADER, parseChargeRows, parseMeasureRows } from '../lib/otherCharges';
import { useAppStore } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import { ErrorList, Field, ImportButton, PageShell, WarningList } from './shared';

/** Trang "Biểu thuế": người dùng tự nhập thuế suất kèm nguồn + ngày cập nhật. Không có thuế suất nào được hard-code. */
export default function TariffTablePage() {
  const tariffs = useDataStore((s) => s.tariffs);
  const { upsertTariff, addTariffs, removeTariff } = useDataStore.getState();
  const showToast = useAppStore((s) => s.showToast);
  const plan = useAppStore((s) => s.plan);
  const official = useDataStore((s) => s.officialTariffs);
  const setOfficial = useDataStore((s) => s.setOfficialTariffs);
  const form = useAppStore((s) => s.form);
  const buyer = form.role === 'seller' ? form.partner : form.mine;
  const seller = form.role === 'seller' ? form.mine : form.partner;
  const blank = (): TariffEntry => ({
    id: '', importCountry: buyer?.country ?? 'VN', hs: form.hs.replace(/\D/g, ''), origin: '*', rateType: 'MFN', fta: '', dutyPct: NaN, vatPct: null, otherPct: 0,
    source: '', effectiveDate: '', updatedAt: todayIso(), verified: false,
  });
  const [d, setD] = useState<TariffEntry>(blank);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const refresh = () => plan && runPlan({ keepSelection: true });
  const save = () => {
    if (d.hs.replace(/\D/g, '').length < 4) return showToast('Mã HS cần ít nhất 4–6 số');
    if (!isFinite(d.dutyPct)) return showToast('Nhập thuế suất nhập khẩu (%)');
    if (!d.source.trim()) return showToast('Bắt buộc nhập nguồn (link văn bản / số hiệu)');
    if (!d.updatedAt) return showToast('Bắt buộc nhập ngày cập nhật');
    if (d.dutyPct < 0 || (d.vatPct ?? 0) < 0 || d.otherPct < 0) return showToast('Thuế suất không được âm');
    if (d.effectiveDate && d.expiryDate && d.expiryDate < d.effectiveDate) return showToast('Ngày hết hiệu lực phải sau ngày hiệu lực');
    upsertTariff({ ...d, id: d.id || Math.random().toString(36).slice(2, 10), hs: d.hs.replace(/\D/g, ''), fta: d.rateType === 'FTA' ? d.fta : '', specificDuty: d.specificDuty?.trim() || undefined, expiryDate: d.expiryDate || undefined });
    setD(blank());
    refresh();
    showToast('Đã lưu mức thuế');
  };
  const link = tariffLookupLink(d.importCountry === 'EU' ? 'DE' : d.importCountry);

  return (
    <PageShell
      title="Biểu thuế"
      intro={<>Thuế nhập khẩu và VAT phụ thuộc mã HS, xuất xứ, hiệp định và thay đổi thường xuyên nên PortRank <b className="text-fg">không tự đoán thuế suất</b>: chỉ dùng mức bạn nhập, hoặc mức lấy từ nguồn chính thức (trực tuyến, hoặc bản chụp có ghi ngày). Bạn tra ở nguồn chính thức rồi nhập vào đây, kèm <b className="text-fg">nguồn</b> và <b className="text-fg">ngày cập nhật</b>. Mức thuế cập nhật quá {TARIFF_STALE_DAYS} ngày sẽ có cảnh báo vàng.</>}
      actions={
        <>
          <ImportButton label="⬆ Nhập bảng A (CSV/Excel)" onRows={(rows) => { const r = parseTariffRows(rows); setErrors(r.errors); setWarnings(r.warnings); if (r.entries.length) { addTariffs(r.entries); refresh(); } showToast(`Đã nhập ${r.entries.length} mức thuế${r.errors.length ? `, bỏ qua ${r.errors.length} dòng` : ''}`); }} />
          <button className="btn" title="Đủ mọi thành phần tính tiền (thuế tuyệt đối, phí, thuế bổ sung, hết hiệu lực…) – nhập lại không mất dữ liệu" onClick={() => downloadText('portrank-bieu-thue-day-du.csv', toCsv([TARIFF_CSV_FULL_HEADER, ...tariffs.map((t) => tariffToRow(t, true))]))}>⬇ Xuất CSV đầy đủ{tariffs.length ? '' : ' (mẫu)'}</button>
          <button className="btn" title="Chỉ 12 cột A – để gửi bên tổng hợp; các thành phần mở rộng KHÔNG có trong file này" onClick={() => downloadText('portrank-bieu-thue-A.csv', toCsv([TARIFF_CSV_HEADER, ...tariffs.map((t) => tariffToRow(t, false))]))}>⬇ Xuất 12 cột A</button>
        </>
      }
    >
      <ErrorList errors={errors} />
      <WarningList items={warnings} />
      <section className="card p-3">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">{d.id ? 'Sửa mức thuế' : 'Nhập một mức thuế'}</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Field label="Nước nhập khẩu">
            <select className="field" value={d.importCountry} onChange={(e) => setD({ ...d, importCountry: e.target.value })}>
              <option value="EU">EU (biểu thuế chung)</option>
              {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Mã HS"><input className="field" value={d.hs} onChange={(e) => setD({ ...d, hs: e.target.value })} placeholder="940360" /></Field>
          <Field label="Xuất xứ">
            <select className="field" value={d.origin} onChange={(e) => setD({ ...d, origin: e.target.value })}>
              <option value="*">Mọi xuất xứ</option>
              {seller && <option value={seller.country}>{countryName(seller.country)} (nước người bán)</option>}
              {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Loại thuế suất">
            <select className="field" value={d.rateType} onChange={(e) => setD({ ...d, rateType: e.target.value as 'MFN' | 'FTA' })}>
              <option value="MFN">MFN (thông thường)</option>
              <option value="FTA">Ưu đãi FTA</option>
            </select>
          </Field>
          <Field label="Hiệp định (nếu FTA)"><input className="field" disabled={d.rateType !== 'FTA'} value={d.fta} onChange={(e) => setD({ ...d, fta: e.target.value })} placeholder="EVFTA, RCEP…" /></Field>
          <Field label="Thuế NK (%)"><input type="number" step="0.1" min={0} className="field" value={isFinite(d.dutyPct) ? d.dutyPct : ''} onChange={(e) => setD({ ...d, dutyPct: e.target.value === '' ? NaN : +e.target.value })} /></Field>
          <Field label="VAT / GST (%)"><input type="number" step="0.1" min={0} className="field" value={d.vatPct ?? ''} onChange={(e) => setD({ ...d, vatPct: e.target.value === '' ? null : +e.target.value })} /></Field>
          <Field label="Thuế khác (%)"><input type="number" step="0.1" min={0} className="field" value={d.otherPct || ''} onChange={(e) => setD({ ...d, otherPct: +e.target.value || 0 })} /></Field>
          <Field label="Nguồn – link văn bản (bắt buộc)" className="col-span-2"><input className="field" value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })} placeholder="https://… hoặc số hiệu văn bản" /></Field>
          <Field label="Thuế tuyệt đối (nếu có)"><input className="field" value={d.specificDuty ?? ''} onChange={(e) => setD({ ...d, specificDuty: e.target.value })} placeholder="1 USD/kg, 90¢/pr." /></Field>
          <Field label="Ngày hiệu lực"><input type="date" className="field" value={d.effectiveDate} onChange={(e) => setD({ ...d, effectiveDate: e.target.value })} /></Field>
          <Field label="Hết hiệu lực"><input type="date" className="field" value={d.expiryDate ?? ''} onChange={(e) => setD({ ...d, expiryDate: e.target.value })} /></Field>
          <Field label="Ngày cập nhật (bắt buộc)"><input type="date" className="field" value={d.updatedAt} onChange={(e) => setD({ ...d, updatedAt: e.target.value })} /></Field>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-fg"><input type="checkbox" checked={d.verified} onChange={(e) => setD({ ...d, verified: e.target.checked })} /> Tôi đã đối chiếu với văn bản gốc (Đã xác minh)</label>
          <button className="btn btn-on !px-4" onClick={save}>{d.id ? 'Lưu thay đổi' : '＋ Thêm mức thuế'}</button>
          {d.id && <button className="btn" onClick={() => setD(blank())}>Huỷ</button>}
          <a className="text-[11.5px]" href={link.url} target="_blank" rel="noreferrer">Tra cứu chính thức: {link.label} ↗</a>
        </div>
      </section>
      <section className="card overflow-x-auto p-1">
        <table className="tbl">
          <thead><tr><th>Nước nhập</th><th>HS</th><th>Xuất xứ</th><th>Loại</th><th className="!text-right">Thuế NK</th><th className="!text-right">VAT</th><th>Nguồn</th><th>Cập nhật</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {tariffs.length === 0 && <tr><td colSpan={10} className="!py-6 text-center text-mute">Chưa có mức thuế nào. Kết quả sẽ ghi “Chưa có dữ liệu thuế” cho đến khi bạn nhập.</td></tr>}
            {tariffs.map((t) => {
              const stale = daysSince(t.updatedAt) > TARIFF_STALE_DAYS || (!!t.expiryDate && t.expiryDate < todayIso());
              return (
                <tr key={t.id}>
                  <td className="text-fg">{t.importCountry === 'EU' ? 'EU' : countryName(t.importCountry)}</td>
                  <td className="font-mono text-fg">{t.hs}</td>
                  <td>{t.origin === '*' ? 'Mọi xuất xứ' : countryName(t.origin)}</td>
                  <td>{t.rateType === 'FTA' ? `FTA ${t.fta}` : 'MFN'}</td>
                  <td className="text-right text-fg">{t.dutyPct}%{t.specificDuty ? ` + ${t.specificDuty}` : ''}</td>
                  <td className="text-right">{t.vatPct == null ? '—' : `${t.vatPct}%`}</td>
                  <td className="max-w-[220px] truncate" title={t.source}>{/^https?:/.test(t.source) ? <a href={t.source} target="_blank" rel="noreferrer">{t.source}</a> : t.source}</td>
                  <td className="whitespace-nowrap">{fmtDateVi(t.updatedAt)}</td>
                  <td className="whitespace-nowrap">
                    <span className={`chip ${t.verified ? 'chip-real' : 'chip-warn'}`}>{t.verified ? 'Đã xác minh' : 'Chưa xác minh'}</span>
                    {stale && <span className="chip chip-warn ml-1">⚠ quá {TARIFF_STALE_DAYS} ngày</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button className="mr-2 text-sky hover:underline" onClick={() => setD(t)}>Sửa</button>
                    <button className="text-mute hover:text-red-300" onClick={() => { removeTariff(t.id); refresh(); }}>Xoá</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <OtherTablesSection onChanged={refresh} />
      <SnapshotSection origin={seller?.country ?? 'VN'} onImported={refresh} />
      <section className="card p-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-fg">Nguồn chính thức (lấy tự động)</h2>
          <label className="flex items-center gap-2 text-xs text-fg"><input type="checkbox" checked={official} onChange={(e) => { setOfficial(e.target.checked); refresh(); }} /> Tự lấy thuế từ nguồn chính thức khi bảng của tôi chưa có</label>
        </div>
        <p className="mb-1.5 text-[11px] text-mute">Thứ tự ưu tiên: biểu thuế bạn nhập → nguồn chính thức của nước nhập. Mức thuế lấy tự động ghi rõ nguồn và ngày lấy; bạn có thể lưu vào bảng để chỉnh.</p>
        <ul className="grid gap-1.5 text-[11.5px] text-mute md:grid-cols-2">
          {OFFICIAL_TARIFF_SOURCES.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-line/60 px-2 py-1">
              <span><a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a> · {s.note}</span>
              <span className={`chip ${s.enabled ? 'chip-real' : 'chip-est'}`}>{s.enabled ? 'Đang dùng' : 'Không có API'}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-mute italic">Số thuế là ước tính để lập kế hoạch; số chính thức do cơ quan hải quan xác định.</p>
      </section>
    </PageShell>
  );
}

/** Bản chụp dữ liệu chính thức (npm run tariffs:update): xem nguồn, ngày, và nạp vào bảng để chỉnh / dùng khi offline */
function SnapshotSection({ origin, onImported }: { origin: string; onImported: () => void }) {
  const snap = TARIFF_SNAPSHOT;
  const tariffs = useDataStore((s) => s.tariffs);
  const showToast = useAppStore((s) => s.showToast);
  if (!snap.generatedAt) return null;
  // MFN (mọi xuất xứ) + ưu đãi FTA cho xuất xứ đang chọn; bỏ mức đã có trong bảng
  const key = (t: TariffEntry) => `${t.importCountry}|${t.hs}|${t.origin}|${t.rateType}`;
  const have = new Set(tariffs.map(key));
  const pick = snap.entries.filter((e) => (e.origin === '*' || e.origin === origin) && !have.has(key(e)));
  const age = daysSince(snap.generatedAt);
  const load = () => {
    useDataStore.getState().addTariffs(pick.map((e) => ({ ...e, id: Math.random().toString(36).slice(2, 10), verified: false })));
    onImported();
    showToast(`Đã nạp ${pick.length} mức thuế (đánh dấu chưa xác minh)`);
  };
  return (
    <section className="card p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-fg">
          Bản chụp dữ liệu đã cập nhật · {fmtDateVi(snap.generatedAt)}{' '}
          {age > TARIFF_STALE_DAYS && <span className="chip chip-warn">⚠ quá {TARIFF_STALE_DAYS} ngày</span>}
        </h2>
        <button className="btn btn-on" disabled={!pick.length} onClick={load}>
          ⬇ Nạp {pick.length} mức thuế (MFN + FTA cho xuất xứ {countryName(origin)})
        </button>
      </div>
      <p className="text-[11px] text-mute">
        {snap.entries.length} mức thuế cho danh mục hàng trong <code>src/data/tariffProducts.csv</code>, tạo bằng <code>npm run tariffs:update</code> (workflow tự chạy ngày 1 và 15 hằng tháng).
        App tự dùng bản chụp khi API trực tuyến không phản hồi. Nạp vào bảng thì mức thuế của bảng được ưu tiên hơn tra trực tuyến – nhớ cập nhật định kỳ.
      </p>
      <ul className="mt-1 text-[11px] text-mute">
        {snap.sources.map((s) => (
          <li key={s.id}>
            · {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}
            {s.release && <> ({s.release})</>}: {snap.entries.filter((e) => (s.id === 'us-hts' ? e.id.startsWith('us-') : s.id === 'uk-tariff' ? e.id.startsWith('uk-') : e.id.startsWith('manual-'))).length} mức
            {s.id === 'manual' && <span className="chip chip-warn ml-1">chưa xác minh</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bảng B (phòng vệ thương mại) và C (thuế/phí khác) + dữ liệu đã tổng hợp đi kèm app */
function OtherTablesSection({ onChanged }: { onChanged: () => void }) {
  const charges = useDataStore((s) => s.charges);
  const measures = useDataStore((s) => s.measures);
  const curated = useDataStore((s) => s.curatedTariffs);
  const { setCharges, setMeasures, setCuratedTariffs } = useDataStore.getState();
  const showToast = useAppStore((s) => s.showToast);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const verified = CURATED_TARIFFS.filter((e) => e.verified).length;
  return (
    <section className="card p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-fg">Bảng B (phòng vệ thương mại) · Bảng C (thuế, phí khác)</h2>
        <div className="flex flex-wrap gap-1.5">
          <ImportButton label="⬆ Nhập bảng B" onRows={(rows) => { const r = parseMeasureRows(rows); setErrors(r.errors); setWarnings([]); setMeasures([...r.measures, ...measures]); onChanged(); showToast(`Đã nhập ${r.measures.length} biện pháp`); }} />
          <ImportButton label="⬆ Nhập bảng C" onRows={(rows) => { const r = parseChargeRows(rows); setErrors(r.errors); setWarnings(r.warnings); setCharges([...r.rules, ...charges]); onChanged(); showToast(`Đã nhập ${r.rules.length} khoản thuế/phí`); }} />
          <button className="btn" onClick={() => downloadText('portrank-bang-B-mau.csv', toCsv([MEASURE_CSV_HEADER]))}>⬇ Mẫu B</button>
          <button className="btn" onClick={() => downloadText('portrank-bang-C-mau.csv', toCsv([CHARGE_CSV_HEADER]))}>⬇ Mẫu C</button>
          {(charges.length > 0 || measures.length > 0) && <button className="btn" onClick={() => { setCharges([]); setMeasures([]); onChanged(); }}>Xoá B/C đã nhập</button>}
        </div>
      </div>
      <ErrorList errors={errors} />
      <WarningList items={warnings} />
      <p className="text-[11px] text-mute">
        Bảng của bạn: {measures.length} biện pháp B · {charges.length} khoản C. Không có dòng ≠ thuế 0: khi bảng B không có dữ liệu cho mã + xuất xứ, kết quả ghi “phòng vệ thương mại chưa kiểm tra” và tổng thuế không được coi là đầy đủ. Các khoản thay thế nhau (DTA thường / cố định, khai điện tử / khai giấy, đường biển / hàng không) chỉ tính một khoản, có ghi giả định.
      </p>
      <div className="mt-2 rounded-md border border-line/60 p-2 text-[11.5px] text-mute">
        <label className="flex items-center gap-2 text-fg"><input type="checkbox" checked={curated} onChange={(e) => { setCuratedTariffs(e.target.checked); onChanged(); }} /> Dùng {CURATED_LABEL}</label>
        <div className="mt-1">
          A: {CURATED_TARIFFS.length} dòng thuế theo mã quốc gia ({CURATED_COUNTRIES.join(', ')}; xuất xứ VN; HS 090111, 610910, 640411, 940350) – {verified} dòng đã xác minh, {CURATED_TARIFFS.length - verified} dòng chưa xác minh (giữ nguyên trạng thái của bên tổng hợp). B: {CURATED_MEASURES.length} dòng → <b className="text-amber-200">chưa kiểm tra</b>, không phải 0. C: {CURATED_CHARGES.length} khoản.
          Thứ tự dùng: bảng của bạn → dữ liệu đã tổng hợp → nguồn chính thức.
        </div>
      </div>
    </section>
  );
}
