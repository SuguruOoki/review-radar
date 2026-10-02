import { resolve } from 'node:path';
import { AXES } from './types.js';
import { AXIS_LABELS, ROUTE_LABELS } from './rules.js';
import { atomicWrite, html, md } from './util.js';
export function location(c) {
    if (!c.oldStart && !c.newStart)
        return `${c.path}（ファイル全体・未解析）`;
    if (c.status === 'D' || c.added === 0)
        return `${c.path}:${c.oldStart}-${c.oldEnd} [base / 削除側]`;
    return `${c.path}:${c.newStart}-${c.newEnd} [head]`;
}
function codeFence(s, lang = '') {
    const longest = Math.max(2, ...[...s.matchAll(/`+/g)].map(m => m[0].length));
    const fence = '`'.repeat(longest + 1);
    return `${fence}${lang}\n${s}\n${fence}`;
}
export function markdown(report) {
    const cs = report.candidates, required = cs.filter(c => c.required).length;
    const out = [
        '# Review Radar — 人間レビューの確認箇所',
        ...(report.demo ? ['> **デモ：人工的に作成した差分のローカル規則による分析です。実際のリポジトリ／Jevの精度測定ではありません。**'] : []),
        `対象: ${md(report.repository.name)} / ${md(report.repository.mode)}  |  生成: ${md(report.createdAt)}`,
        `base: \`${report.repository.base}\` → head: \`${md(report.repository.head)}\``,
        `解析単位: **${cs.length}** / 必須確認: **${required}** / 対象外: **${report.omissions.length}**`,
        '> この指数は欠陥確率ではなく、暫定的なレビュー優先度です。低い指数・通常候補・終了コード0は、安全性やマージ可を意味しません。自動承認・自動修正・テスト実行は行いません。',
        '## 最初に見る候補（最大5件）',
        ...cs.slice(0, 5).map((c, i) => `${i + 1}. **${md(ROUTE_LABELS[c.route])}** — ${md(location(c))} — 指数 ${c.score ?? '未評価'}/100、評価済み重み ${Math.round(c.knownWeight * 100)}% — \`${c.id}\``),
        ...(cs.length === 0 ? ['差分の解析候補はありません。対象refと対象外一覧も確認してください。'] : []),
        '## 未確認事項', ...report.warnings.map(w => '- ' + md(w)),
        `CI: **${report.ci.status}** — ${md(report.ci.note)}`,
        `Jev HTTP試行: ${report.usage.requests} / キャッシュ: ${report.usage.cacheHits} / API未完了: ${report.usage.budgetSkipped} / 失敗試行: ${report.usage.errors}`,
        `APIから報告されたtoken: input ${report.usage.inputTokens} / output ${report.usage.outputTokens}。タイムアウト等の課金を含む請求額ではありません。`,
        '## 全候補'
    ];
    for (const c of cs) {
        out.push(`### ${md(location(c))}`, `**${md(ROUTE_LABELS[c.route])}** · 指数 **${c.score ?? '未評価'}/100** · 評価済み重み ${Math.round(c.knownWeight * 100)}% · ${c.providerStatus} · \`${c.id}\``, ...c.signals.map(s => `- ${md(s.title)} — ${md(s.note)} [${s.evidenceId}]`), '**人間が確認する問い**', ...c.questions.map(q => '- ' + md(q)), '**評価軸**', ...AXES.map(a => `- ${AXIS_LABELS[a]}: ${c.axes[a].value === null ? '未評価' : (c.axes[a].value * 4).toFixed(2) + '/4'} — ${md(c.axes[a].note)}`), '**未確認・追加材料**', ...c.missing.map(m => '- ' + md(m)), `Jevの分布エントロピー: ${c.uncertainty ?? '未計算'}（正しさの確率ではない） / 選択根拠: ${c.selectedEvidenceId ?? '未選択'}`, '**根拠**');
        for (const e of c.evidence)
            out.push(`**${e.id}** ${md(e.path)} ${e.side}:${e.start}-${e.end} (${e.kind})${e.truncated ? ' — 一部省略' : ''}`, codeFence(e.text, e.kind === 'diff' ? 'diff' : 'text'));
    }
    out.push('## 下位候補の抜き取り確認', report.auditSample.length ? report.auditSample.map(id => '`' + id + '`').join(', ') : '上位5件より下の候補はありません。', '## 対象外・未解析パス');
    out.push(...(report.omissions.length ? report.omissions.map(o => `- ${md(o.path)}: ${md(o.reason)}`) : ['対象外パスなし（全依存関係の解析完了を意味しません）。']));
    out.push('## 識別子', `Report ID: \`${report.id}\` / schema ${report.schemaVersion} / tool ${report.toolVersion}`, '重み・閾値は未較正の初期値です。Jevの実用途精度は人間の評価結果で検証してください。');
    return out.join('\n\n') + '\n';
}
function evidenceHtml(c) {
    return c.evidence.map(e => `<div class="evidence"><div class="evidence-label"><b>${html(e.id)}</b><span>${html(e.path)} · ${html(e.side)}:${e.start}–${e.end} · ${html(e.kind)}${e.truncated ? ' · 一部省略' : ''}</span></div><pre><code>${html(e.text)}</code></pre></div>`).join('');
}
function card(c, i, audit) {
    return `<article class="review-card ${c.route}" id="${html(c.id)}" data-route="${c.route}" data-search="${html(c.path + ' ' + c.signals.map(s => s.title).join(' ') + ' ' + c.id)}">
    <div class="card-top"><div class="rank">${String(i + 1).padStart(2, '0')}</div><div class="card-heading"><div class="eyebrow"><span class="badge ${c.route}">${html(ROUTE_LABELS[c.route])}</span><span class="provider">${html(c.providerStatus)}</span>${audit.includes(c.id) ? '<span class="audit">抜き取り推奨</span>' : ''}</div><h2>${html(c.path)}</h2><p class="location">${html(location(c).slice(c.path.length))} · +${c.added} / −${c.removed}</p></div><div class="score"><strong>${c.score === null ? '—' : c.score.toFixed(1)}</strong><span>暫定指数 / 100</span><small>評価済み重み ${Math.round(c.knownWeight * 100)}%</small></div></div>
    <div class="card-body"><div class="signals">${c.signals.length ? c.signals.map(s => `<p><b>${html(s.title)}</b><span>${html(s.note)} [${html(s.evidenceId)}]</span></p>`).join('') : '<p>特定の重要パターンは検出されていません。欠陥の不存在を意味しません。</p>'}</div>
    <div class="question-box"><h3>人間が答える問い</h3><ol>${c.questions.map(q => `<li>${html(q)}</li>`).join('')}</ol></div>
    <div class="axes">${AXES.map(a => `<div class="axis"><span>${AXIS_LABELS[a]}</span><div class="track"><div style="width:${(c.axes[a].value ?? 0) * 100}%"></div></div><b>${c.axes[a].value === null ? '未評価' : (c.axes[a].value * 4).toFixed(1) + '/4'}</b></div>`).join('')}</div>
    <details class="context"><summary>未確認事項・評価の内訳 (${c.missing.length})</summary><ul>${c.missing.map(m => `<li>${html(m)}</li>`).join('')}</ul><p>分布エントロピー: ${c.uncertainty ?? '未計算'}。Jevのconfidenceや分布の集中度は、回答が正しい確率ではありません。</p><ul>${AXES.map(a => `<li>${AXIS_LABELS[a]} / ${c.axes[a].source}: ${html(c.axes[a].note)}</li>`).join('')}</ul>${c.providerError ? `<p>API: ${html(c.providerError)}</p>` : ''}</details>
    <details class="evidence-details"><summary>根拠を読む (${c.evidence.length})${c.selectedEvidenceId ? ' · Jev選択: ' + html(c.selectedEvidenceId) : ''}</summary>${evidenceHtml(c)}</details>
    <div class="card-foot"><code>${html(c.id)}</code><span>レビュー結果はCLIの feedback で記録</span></div></div></article>`;
}
export function reportHtml(report) {
    const required = report.candidates.filter(c => c.required).length, context = report.candidates.filter(c => c.route === 'context_needed').length;
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'"><title>Review Radar | ${html(report.repository.name)}</title>
<style>
:root{--ink:#172c36;--muted:#647682;--line:#dce4e6;--bg:#f3f6f5;--accent:#176a65;--red:#9d4231;--amber:#946400}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;font-size:14px;line-height:1.75}header{background:#133b42;color:white;padding:38px 6vw 34px;border-bottom:5px solid #72b9a8}header .brand{font-size:12px;letter-spacing:.18em;opacity:.75}header h1{margin:8px 0 4px;font-size:34px;letter-spacing:-.025em}header p{margin:0;color:#c9dedf}header .meta{font-size:12px;margin-top:16px;overflow-wrap:anywhere;color:#a7c4c7}main{max-width:1180px;margin:auto;padding:26px 28px 60px}.banner{border:1px solid #d5b974;background:#fff9e8;padding:12px 18px;border-radius:8px;margin-bottom:18px}.demo{background:#e1eeeb;border-color:#86b5aa}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:20px 0}.stat{padding:17px 20px;background:white;border:1px solid var(--line);border-radius:10px}.stat span{font-size:12px;color:var(--muted)}.stat strong{font-size:32px;display:block;line-height:1.4;font-weight:650}.stat small{font-size:11px;color:var(--muted)}.controls{display:flex;gap:12px;margin:26px 0 16px;align-items:center}.controls input,.controls select{font:inherit;background:white;border:1px solid #becdce;border-radius:7px;padding:10px 12px;color:var(--ink)}.controls input{flex:1;min-width:0}.count{font-size:12px;white-space:nowrap}.review-card{background:white;border:1px solid var(--line);border-left:4px solid #8da6a8;border-radius:10px;margin-bottom:18px;overflow:hidden}.review-card.human_required{border-left-color:var(--red)}.review-card.human_review{border-left-color:var(--amber)}.review-card.context_needed{border-left-color:#846fa5}.card-top{display:flex;padding:20px 22px 16px;gap:16px;border-bottom:1px solid #edf0f0;align-items:flex-start}.rank{color:#9aabad;font-size:19px;font-weight:650;min-width:24px;padding-top:4px}.card-heading{flex:1;min-width:0}.card-heading h2{font-size:18px;line-height:1.4;margin:9px 0 4px;overflow-wrap:anywhere}.eyebrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.badge{font-size:11px;font-weight:650;padding:3px 9px;border-radius:4px;background:#e7efef;color:#346362}.badge.human_required{background:#fae9e2;color:#913b2b}.badge.human_review{background:#fff1d3;color:#8b6106}.badge.context_needed{background:#eee9f5;color:#655083}.provider,.audit{color:#748288;font-size:11px}.audit{color:var(--accent)}.location{font-size:12px;color:var(--muted);margin:0}.score{min-width:112px;text-align:right}.score strong{display:block;font-size:28px;font-weight:650;line-height:1.3}.score span,.score small{display:block;font-size:10px;color:var(--muted)}.card-body{padding:16px 24px}.signals p{margin:0 0 10px;font-size:13px}.signals p span{display:block;color:var(--muted);font-size:11px}.question-box{background:#f0f7f4;padding:13px 17px;border-radius:6px;margin:16px 0}.question-box h3{margin:0;color:var(--accent);font-size:12px}.question-box ol{margin:6px 0 0;padding-left:22px}.question-box li{margin:3px 0;font-size:13px}.axes{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin:18px 0}.axis{font-size:10px;color:var(--muted)}.axis b{font-size:11px;color:#38575e;font-weight:500}.track{height:5px;background:#e6ecec;border-radius:4px;margin:6px 0;overflow:hidden}.track div{height:100%;background:#5f968c}details{border-top:1px solid #e5ebeb;padding:11px 0}summary{cursor:pointer;font-size:12px;font-weight:600;color:#49666f}details p,details li{font-size:12px;color:var(--muted)}details ul{padding-left:20px}.evidence{margin:15px 0}.evidence-label{display:flex;gap:12px;font-size:11px;color:#5d747d;margin:6px 0;overflow-wrap:anywhere}.evidence-label b{background:#e7efef;padding:0 5px;white-space:nowrap}pre{margin:0;background:#162d37;color:#d6e7e7;padding:17px;border-radius:7px;white-space:pre;overflow:auto;font-size:11px;line-height:1.8}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.card-foot{border-top:1px solid #edf0f0;padding-top:11px;margin-top:5px;display:flex;justify-content:space-between;gap:16px;font-size:10px;color:#7d8f95}.notes{padding:18px 22px;background:white;border:1px solid var(--line);border-radius:9px;margin-top:24px}.notes h2{font-size:16px;margin:0 0 10px}.notes ul{padding-left:20px;margin:10px 0}.notes li{font-size:12px;margin:5px 0}.notes table{width:100%;border-collapse:collapse;font-size:12px}.notes td{border-bottom:1px solid var(--line);padding:9px;overflow-wrap:anywhere}footer{color:var(--muted);font-size:11px;padding:25px 0}.empty{padding:30px;text-align:center;color:var(--muted)}[hidden]{display:none!important}@media(max-width:700px){header{padding:25px}header h1{font-size:26px}main{padding:18px 14px}.stats{grid-template-columns:repeat(2,1fr);gap:10px}.controls{flex-wrap:wrap}.controls input{flex-basis:100%}.card-top{padding:16px 12px;gap:9px}.card-body{padding:12px 15px}.card-heading h2{font-size:15px}.score{min-width:70px}.score strong{font-size:23px}.rank{font-size:15px;min-width:20px}.axes{grid-template-columns:repeat(3,1fr)}.card-foot{flex-direction:column;gap:4px}}@media print{header{background:white;color:black;padding:12px;border-bottom:2px solid #555}header p,header .meta{color:#555}main{max-width:none;padding:12px}.controls{display:none}.review-card{break-inside:avoid}details:not([open]){display:none}.stats{margin:10px 0}}
</style></head><body><header><div class="brand">REVIEW RADAR / HUMAN ATTENTION, GROUNDED IN EVIDENCE</div><h1>人間が見るべき変更を、根拠とともに。</h1><p>${html(report.repository.name)} · ${html(report.repository.mode)} · ${report.provider === 'jev' ? 'Jev + deterministic rules' : 'ローカル規則による暫定分析'}</p><div class="meta">${html(report.createdAt)} / base ${report.repository.base.slice(0, 10)} → ${html(report.repository.head.slice(0, 12))} / ${html(report.id)}</div></header>
<main>${report.demo ? '<div class="banner demo"><b>DEMO</b> — 人工的な変更例です。実リポジトリの分析やJev実通信による結果ではありません。</div>' : ''}<div class="banner">指数は<strong>欠陥確率ではありません</strong>。低い指数や通常候補は安全性を意味しません。自動承認・修正・テスト実行は行わず、人間への確認順序を提案します。</div>
<div class="stats"><div class="stat"><span>解析した差分単位</span><strong>${report.candidates.length}</strong><small>変更されたまとまりごと</small></div><div class="stat"><span>人間の確認が必須</span><strong>${required}</strong><small>重みで相殺しないルール</small></div><div class="stat"><span>追加材料が必要</span><strong>${context}</strong><small>必須確認とは別のルート件数</small></div><div class="stat"><span>Jev HTTP試行 / キャッシュ</span><strong>${report.usage.requests} <small style="display:inline;font-size:20px">/ ${report.usage.cacheHits}</small></strong><small>${report.omissions.length} パスが対象外</small></div></div>
<div class="controls"><input type="search" id="search" placeholder="ファイル名・確認事項・IDで検索" aria-label="候補を検索"><select id="route" aria-label="確認ルート"><option value="all">すべての候補</option><option value="human_required">人間の確認が必須</option><option value="human_review">人間レビューを優先</option><option value="context_needed">判断材料を追加</option><option value="regular_review">通常レビュー候補</option></select><span class="count" id="count">${report.candidates.length} 件</span></div>
<section id="cards">${report.candidates.map((c, i) => card(c, i, report.auditSample)).join('')}</section><p class="empty" id="empty" ${report.candidates.length ? 'hidden' : ''}>該当する候補はありません。対象refと対象外一覧も確認してください。</p>
<section class="notes"><h2>未確認事項と実行状況</h2><ul>${report.warnings.map(w => `<li>${html(w)}</li>`).join('')}</ul><p>CI: <b>${report.ci.status}</b> — ${html(report.ci.note)}</p><p>報告済みtoken: input ${report.usage.inputTokens} / output ${report.usage.outputTokens}。タイムアウト等を含む請求額ではありません。API失敗試行 ${report.usage.errors}、予算による未採点 ${report.usage.budgetSkipped}。</p><p>解析材料の不足: ${report.complete ? '設定範囲の処理は完了（安全性・全依存の確認ではない）' : '未解析または追加確認が必要な材料あり'}</p></section>
<section class="notes"><h2>対象外のパス / ${report.omissions.length}</h2>${report.omissions.length ? `<table><tbody>${report.omissions.map(o => `<tr><td>${html(o.path)}</td><td>${html(o.reason)}</td></tr>`).join('')}</tbody></table>` : '<p>対象外パスはありません。全依存関係を解析した意味ではありません。</p>'}</section>
<footer>Review Radar 0.2.1 · 重みと閾値は未較正の初期値です。Jevの精度やレビュー工数の削減効果は未検証です。<br>このレポートはソースの抜粋を含みます。外部への共有・アップロード前に内容を確認してください。外部通信やテレメトリはありません。</footer></main>
<script>
const search = document.getElementById('search'), route = document.getElementById('route');
function filter(){let visible=0;const q=search.value.toLowerCase();document.querySelectorAll('.review-card').forEach(card=>{const show=(route.value==='all'||card.dataset.route===route.value)&&card.dataset.search.toLowerCase().includes(q);card.hidden=!show;if(show)visible++});document.getElementById('count').textContent=visible+' 件';document.getElementById('empty').hidden=visible!==0}
search.addEventListener('input',filter);route.addEventListener('change',filter);
</script></body></html>`;
}
export function writeReport(report, out) {
    atomicWrite(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    atomicWrite(resolve(out, 'report.md'), markdown(report));
    atomicWrite(resolve(out, 'report.html'), reportHtml(report));
}
//# sourceMappingURL=report.js.map