import {getOperator,recheckOperator,operatorGuard} from './app-access';
import {all,first,db,bucket,noCache} from './maintenance';
import {forbidRegionalMove,isRegionalRequest} from './regional-access';
import {clientCatalog} from './client-catalog';
import {createMobilizationApi} from './mobilization-api';
export const mobilizationApi=createMobilizationApi({getOperator,recheckOperator,operatorGuard,all,first,db,bucket,noCache,forbidRegionalMove,isRegionalRequest,clientCatalog});
