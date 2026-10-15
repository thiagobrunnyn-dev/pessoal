import {getOperator,recheckOperator,operatorGuard} from './app-access';
import {all,first,db,noCache} from './maintenance';
import {createOccupancyApi} from './occupancy-api';
export const occupancyApi=createOccupancyApi({getOperator,recheckOperator,operatorGuard,all,first,db,noCache});
