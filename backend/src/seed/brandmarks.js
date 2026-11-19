// Logo marks for demo stores, as inline SVG data URIs (no hosting needed, sharp at any size, and they double as the tab icon).
const svg = (body) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120' width='120' height='120'>${body}</svg>`)}`;

// Fashion Hub: black tile, thin gold ring, serif monogram and a hairline rule.
const FH_ID = 'fhlogo2';
const fhLogo = svg(`<defs><linearGradient id='${FH_ID}' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f3dc92'/><stop offset='1' stop-color='#b8892f'/></linearGradient></defs>
<rect width='120' height='120' rx='28' fill='#0b0b0d'/><circle cx='60' cy='60' r='47' fill='none' stroke='url(#${FH_ID})' stroke-width='2.5'/><circle cx='60' cy='60' r='41' fill='none' stroke='url(#${FH_ID})' stroke-width='.8' opacity='.6'/>
<text x='60' y='72' text-anchor='middle' font-family='Georgia, Times New Roman, serif' font-size='40' font-weight='700' letter-spacing='1' fill='url(#${FH_ID})'>FH</text>
<path d='M38 86h44' stroke='url(#${FH_ID})' stroke-width='1.6' stroke-linecap='round'/>`);

// Rehmat-e-Sheereen: warm caramel tile with a monogram and a small crown of dots.
const RS_ID = 'rslogo1';
const rsLogo = svg(`<defs><linearGradient id='${RS_ID}' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f0c777'/><stop offset='1' stop-color='#b9712a'/></linearGradient></defs>
<rect width='120' height='120' rx='28' fill='#24120c'/><rect x='8' y='8' width='104' height='104' rx='22' fill='none' stroke='url(#${RS_ID})' stroke-width='2'/>
<circle cx='42' cy='30' r='3' fill='url(#${RS_ID})'/><circle cx='60' cy='25' r='3.6' fill='url(#${RS_ID})'/><circle cx='78' cy='30' r='3' fill='url(#${RS_ID})'/>
<text x='60' y='77' text-anchor='middle' font-family='Georgia, Times New Roman, serif' font-size='44' font-weight='700' fill='url(#${RS_ID})'>RS</text>
<path d='M36 90h48' stroke='url(#${RS_ID})' stroke-width='1.6' stroke-linecap='round'/>`);

module.exports = { fhLogo, rsLogo, FH_ID, RS_ID };
