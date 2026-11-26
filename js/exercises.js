// Grupos musculares y ejercicios habituales con su grupo, descanso (s) y salto de peso (kg).
export const GROUPS = [
  { id: "pecho", name: "Pecho" },
  { id: "espalda", name: "Espalda" },
  { id: "hombro", name: "Hombro" },
  { id: "biceps", name: "Bíceps" },
  { id: "triceps", name: "Tríceps" },
  { id: "cuadriceps", name: "Cuádriceps" },
  { id: "femoral", name: "Femoral" },
  { id: "gluteo", name: "Glúteo" },
  { id: "gemelo", name: "Gemelo" },
  { id: "core", name: "Core" },
];
export const groupName = (id) => GROUPS.find((g) => g.id === id)?.name || "Sin grupo";

const E = (name, group, rest = 90, step = 2.5) => ({ name, group, rest, step });
export const DEFAULT_EXERCISES = [
  E("Press banca", "pecho", 150),
  E("Press banca inclinado", "pecho", 120),
  E("Press inclinado con mancuernas", "pecho", 120, 2),
  E("Aperturas con mancuernas", "pecho", 75, 2),
  E("Fondos", "pecho", 120),
  E("Cruces en polea", "pecho", 60),
  E("Dominadas", "espalda", 150),
  E("Jalón al pecho", "espalda", 90),
  E("Remo con barra", "espalda", 120),
  E("Remo con mancuerna", "espalda", 90, 2),
  E("Remo en polea baja", "espalda", 90),
  E("Peso muerto", "espalda", 180),
  E("Press militar", "hombro", 120),
  E("Press de hombro con mancuernas", "hombro", 90, 2),
  E("Elevaciones laterales", "hombro", 60, 1),
  E("Face pull", "hombro", 60),
  E("Curl con barra", "biceps", 75),
  E("Curl con mancuernas", "biceps", 75, 2),
  E("Curl martillo", "biceps", 75, 2),
  E("Press francés", "triceps", 75),
  E("Extensión de tríceps en polea", "triceps", 60),
  E("Sentadilla", "cuadriceps", 180),
  E("Sentadilla frontal", "cuadriceps", 150),
  E("Prensa", "cuadriceps", 120, 5),
  E("Zancadas", "cuadriceps", 90, 2),
  E("Sentadilla búlgara", "cuadriceps", 90, 2),
  E("Extensión de cuádriceps", "cuadriceps", 75),
  E("Peso muerto rumano", "femoral", 150),
  E("Curl femoral", "femoral", 75),
  E("Hip thrust", "gluteo", 120, 5),
  E("Elevación de gemelos", "gemelo", 60, 5),
  E("Plancha", "core", 60, 0),
  E("Rueda abdominal", "core", 60, 0),
  E("Elevación de piernas colgado", "core", 60, 0),
];

export const normName = (s) => s.trim().toLowerCase();
