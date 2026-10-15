import {getOperator, recheckOperator, operatorGuard} from './app-access';
import {all, first, db, noCache} from './maintenance';
import {isRegionalRequest} from './regional-access';
import {createVehiclesApi} from './vehicles-api';
export const vehiclesApi = createVehiclesApi({getOperator, recheckOperator, operatorGuard, all, first, db, noCache, isRegionalRequest});
