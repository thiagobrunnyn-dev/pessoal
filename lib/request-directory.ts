import {db, bucket, noCache} from './maintenance';
import {SITE_OWNER_ID} from './owner-access';
import {citiesForState} from './city-catalog';
import {BRAZIL_STATES} from './brazil-states';
import {sanitizePhoto} from './photo-privacy';
import {requesterScope} from './request-directory-policy';
import {
  directoryLabel, projectRequestDirectory, REQUEST_DIRECTORY_PHOTO_ID, REQUEST_DIRECTORY_PHOTO_TYPES,
  type DirectoryPersonRow, type DirectoryClientRow, type DirectoryCenterRow,
} from './request-directory-model';

export const REQUEST_DIRECTORY_HEADERS = {
  ...noCache,
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

// Public names/photos require explicit requester approval; catalogs remain authorized.
// This is an isolated owner-scoped projection, not a public switch on the private people APIs.
export async function publicRequestDirectory() {
  const scope = requesterScope();
  const [people, clients, centers] = await Promise.all([
    db().prepare(`SELECT p.id,p.display_name,p.city,p.state_code,p.client_id,p.cost_center_id,
      CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END has_photo
      FROM person_profiles p
      LEFT JOIN person_photo_assets a ON a.id=p.current_photo_asset_id
        AND a.profile_id=p.id AND a.owner_id=p.owner_id
        AND a.content_type IN ('image/jpeg','image/png') AND a.size>0 AND a.size<=10485760
      WHERE p.owner_id=? AND p.directory='collaborator' AND p.status='active'
        AND p.name_pending=0 AND trim(p.display_name)<>''
        AND ${scope.sql}
      ORDER BY p.display_name,p.id`).bind(SITE_OWNER_ID, ...scope.ids).all<DirectoryPersonRow>(),
    db().prepare(`SELECT id,name FROM clients
      WHERE owner_id=? AND archived_at IS NULL ORDER BY name,id`).bind(SITE_OWNER_ID).all<DirectoryClientRow>(),
    db().prepare(`SELECT c.id,c.name,c.client_id FROM cost_centers c
      JOIN clients p ON p.id=c.client_id AND p.owner_id=c.owner_id
      WHERE c.owner_id=? AND c.archived_at IS NULL AND p.archived_at IS NULL
      ORDER BY c.name,c.id`).bind(SITE_OWNER_ID).all<DirectoryCenterRow>(),
  ]);
  const cities = Object.keys(BRAZIL_STATES).flatMap(state =>
    citiesForState(state).map(city => ({id: city.id, name: `${city.name} - ${state}`})),
  );
  return projectRequestDirectory(people.results, clients.results, centers.results, cities);
}

type CurrentPhoto = {display_name: string; id: string; object_key: string; content_type: string};
const currentPhotoSql = `SELECT p.display_name,a.id,a.object_key,a.content_type
  FROM person_profiles p JOIN person_photo_assets a
    ON a.id=p.current_photo_asset_id AND a.profile_id=p.id AND a.owner_id=p.owner_id
  WHERE p.id=? AND p.owner_id=? AND p.directory='collaborator' AND p.status='active'
    AND p.name_pending=0 AND trim(p.display_name)<>''
    AND a.content_type IN ('image/jpeg','image/png') AND a.size>0 AND a.size<=10485760`;
const unavailable = () => new Response('Foto não encontrada.', {status: 404, headers: REQUEST_DIRECTORY_HEADERS});

export async function publicRequestDirectoryPhoto(id: string) {
  const scope = requesterScope();
  if (!REQUEST_DIRECTORY_PHOTO_ID.test(id) || !scope.ids.includes(id)) return unavailable();
  const scopedPhotoSql = currentPhotoSql + ' AND ' + scope.sql;
  const photo = await db().prepare(scopedPhotoSql).bind(id, SITE_OWNER_ID, ...scope.ids).first<CurrentPhoto>();
  if (!photo || !directoryLabel(photo.display_name) || !REQUEST_DIRECTORY_PHOTO_TYPES.some(type => type === photo.content_type)) return unavailable();
  const object = await bucket().get(photo.object_key);
  if (!object || object.size > 10485760) return unavailable();
  let bytes: Uint8Array;
  try { bytes = sanitizePhoto(await object.arrayBuffer(), photo.content_type); }
  catch { return unavailable(); }
  // Respect an in-flight deactivation or photo replacement before sending bytes.
  const current = await db().prepare(scopedPhotoSql).bind(id, SITE_OWNER_ID, ...scope.ids).first<CurrentPhoto>();
  if (!current || !directoryLabel(current.display_name) || current.id !== photo.id || current.object_key !== photo.object_key || current.content_type !== photo.content_type) return unavailable();
  return new Response(bytes.buffer as ArrayBuffer, {headers: {
    ...REQUEST_DIRECTORY_HEADERS,
    'Content-Type': photo.content_type,
    'Content-Disposition': 'inline',
  }});
}
