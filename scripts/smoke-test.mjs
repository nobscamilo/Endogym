import { glycemicLoad, classifyGlycemicLoad, estimateDailyGlycemicImpact } from '../src/core/glucose.js';
import { calculateCalories, buildMacroPlan } from '../src/core/nutrition.js';

const gl = glycemicLoad(55, 30);
const glClass = classifyGlycemicLoad(gl);
const daily = estimateDailyGlycemicImpact(95);

const calories = calculateCalories({ proteinGrams: 140, carbsGrams: 180, fatGrams: 70 });
const plan = buildMacroPlan(2200, 'glycemic_control');

console.log('GL plato:', gl, glClass);
console.log('Impacto diario:', daily);
console.log('Calorías calculadas:', calories);
console.log('Plan sugerido:', plan);
