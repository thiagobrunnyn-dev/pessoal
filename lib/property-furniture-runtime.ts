import {getOperator,recheckOperator,operatorGuard} from './app-access';
import {all,first,db,bucket,noCache} from './maintenance';
import {forbidRegionalMove,isRegionalRequest} from './regional-access';
import {clientCatalog} from './client-catalog';
import {mobilizationApi} from './mobilization-runtime';
import {createPropertyFurnitureApi} from './property-furniture-api';
export const propertyFurnitureApi=createPropertyFurnitureApi({getOperator,recheckOperator,operatorGuard,all,first,db,bucket,noCache,forbidRegionalMove,isRegionalRequest,clientCatalog,mobilizationFurniture:mobilizationApi.PROPERTY_FURNITURE});
