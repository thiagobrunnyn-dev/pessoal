import {getOperator,recheckOperator,operatorGuard} from './app-access';
import {all,first,db,bucket,noCache} from './maintenance';
import {createPropertyInspectionApi} from './property-inspection-api';
export const propertyInspectionApi=createPropertyInspectionApi({getOperator,recheckOperator,operatorGuard,all,first,db,bucket,noCache});
