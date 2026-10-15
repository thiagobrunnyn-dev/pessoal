import {listIntegrationKeys,createIntegrationKey,revokeIntegrationKey} from '../../../../lib/integration-keys';
export const dynamic='force-dynamic';
export const GET=listIntegrationKeys;
export const POST=createIntegrationKey;
export const DELETE=revokeIntegrationKey;
