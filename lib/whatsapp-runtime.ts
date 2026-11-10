import {getOperator, recheckOperator, operatorGuard} from './app-access';
import {all, first, db, noCache} from './maintenance';
import {isRegionalRequest} from './regional-access';
import {createWhatsappApi} from './whatsapp-api';
export const whatsappApi = createWhatsappApi({getOperator, recheckOperator, operatorGuard, all, first, db, noCache, isRegionalRequest});
