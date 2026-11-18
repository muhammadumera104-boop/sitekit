// Curated, relevant Unsplash photos (free Unsplash licence) used by the demo tenants.
// `npm run seed:photos` copies them into your Cloudinary account (multitenant/demo/<id>);
// the seed then references the Cloudinary copies, falling back to Unsplash if Cloudinary is off.
const env = require('../config/env');

const IDS = {
  // Kababjees
  kjHero: '1555939594-58d7cb561ad1', seekh: '1603360946369-dc9bb6258143', boti: '1708597521669-f7312f312b29', malai: '1532636875304-0c89119d9b4d',
  roll: '1529006557810-274b9b2fc783', zinger: '1700768400970-428c50bffc11', mint: '1653542772393-71ffa417b1c4', cola: '1624552184280-9e9631bbeee9',
  kj1: '1534177616072-ef7dc120449d', kj2: '1508424757105-b6d5ad9329d0', kj3: '1558540319-35836c870b28', kj4: '1632158929962-a929c9e87570', kj5: '1577367997065-fdd8fd94fb3f',
  // United King
  ukHero: '1568254183919-78a4f43a2877', fudge: '1517427294546-5aa121f68e8a', velvet: '1714949134591-d6f2c581b20d', patty: '1682263167429-0dbcf2c1e127', bread: '1534620808146-d33bb39128b2',
  uk1: '1583338917451-face2751d8d5', uk2: '1534432182912-63863115e106', uk3: '1614707267537-b85aaf00c4b7', uk4: '1549931319-a545dcf3bc73', uk5: '1606983340126-99ab4feaa64a',
  // Foodin
  fiHero: '1550547660-d9450f859349', smash: '1572802419224-296b0aeee0d9', crispy: '1705131186176-1c7cdb830815', bowl: '1679279726946-a158b8bcaa23', fries: '1630384060421-cb20d0e0649d',
  fi1: '1466978913421-dad2ebd01d17', fi2: '1607013251379-e6eecfffe234', fi3: '1518013431117-eb1465fa5752', fi4: '1568901346375-23c9450c58cd', fi5: '1667329829058-ac191ba4a905',
  // Kravemart
  kmHero: '1604719312566-8912e9227c6a', chips: '1613919113640-25732ec5e61f', choc: '1610450949065-1f2841536c88', peanuts: '1546545584-c03ac781caaf', oj: '1640213505284-21352ee0d76b',
  water: '1616118132534-381148898bb4', dish: '1649005011845-ef225c89da86', tomato: '1485637701894-09ad422f6de6', veg: '1566385101042-1a0aa0c1268c',
  karahi: '1694579740719-0e601c5d2437', steak: '1588168333986-5078d3ae3976', pasta: '1546549032-9571cd6b27df', pizza: '1565299624946-b28f40a0ae38',
  jalebi: '1760263217152-009971f0bccc', sweets: '1782033032439-a2c656ca2f59',
  km1: '1488459716781-31db52582fe9', km2: '1542838132-92c53300491e', km3: '1670684684445-a4504dca0bbc', km4: '1550989460-0adf9ea622e2',
};

const cloud = env.cloudinary.cloudName;
// width is baked into the URL; f_auto/q_auto give modern formats and compression.
const photo = (key, w = 800) => {
  const id = IDS[key];
  if (!id) throw new Error(`Unknown photo ${key}`);
  return cloud
    ? `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,c_fill,w_${w}/multitenant/demo/${id}`
    : `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;
};

// Brand assets copied from a tenant's real website (SRS FR-E2). Uploaded once to Cloudinary under a fixed id.
const REMOTE = {
  kmLogo: { url: 'https://kravemart.com/wp-content/themes/kravemart-child/assets/images/kravemart-logo.png', id: 'multitenant/demo/kravemart-logo' },
};
const brand = (key) => (cloud ? `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,h_120/${REMOTE[key].id}` : REMOTE[key].url);

module.exports = { IDS, photo, brand };

if (require.main === module) {
  const cloudinary = require('cloudinary').v2;
  if (!env.cloudinaryEnabled) { console.error('Cloudinary is not configured in backend/.env'); process.exit(1); }
  cloudinary.config({ cloud_name: env.cloudinary.cloudName, api_key: env.cloudinary.apiKey, api_secret: env.cloudinary.apiSecret, secure: true });
  (async () => {
    let ok = 0; const failed = [];
    for (const [key, id] of Object.entries(IDS)) {
      try {
        await cloudinary.uploader.upload(`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1800&q=80`, { public_id: `multitenant/demo/${id}`, overwrite: false, resource_type: 'image' });
        ok++; process.stdout.write('.');
      } catch (e) { failed.push(`${key} (${id}): ${e.message}`); }
    }
    for (const r of Object.values(REMOTE)) {
      try { await cloudinary.uploader.upload(r.url, { public_id: r.id, overwrite: false, resource_type: 'image' }); ok++; } catch (e) { failed.push(`${r.id}: ${e.message}`); }
    }
    console.log(`\nUploaded ${ok}/${Object.keys(IDS).length + Object.keys(REMOTE).length}`);
    if (failed.length) console.log('Failed:\n' + failed.join('\n'));
  })();
}
