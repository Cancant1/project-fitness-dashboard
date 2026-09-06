import { Navigate, Route, Routes } from "react-router-dom";
import { AlertTriangle, Database, LoaderCircle } from "lucide-react";
import { useAppStore } from "./AppStore";
import { AppShell } from "../components/shell/AppShell";
import { TodayPage } from "../pages/TodayPage";
import { TrainPage } from "../pages/train/TrainPage";
import { WorkoutPage } from "../pages/train/WorkoutPage";
import { SessionPage } from "../pages/train/SessionPage";
import { ProgramsPage } from "../pages/train/ProgramsPage";
import { ExerciseLibraryPage } from "../pages/train/ExerciseLibraryPage";
import { ProgressPage } from "../pages/progress/ProgressPage";
import { ExerciseProgressPage } from "../pages/progress/ExerciseProgressPage";
import { NutritionPage } from "../pages/nutrition/NutritionPage";
import { FoodsPage } from "../pages/nutrition/FoodsPage";
import { EnergyPage } from "../pages/nutrition/EnergyPage";
import { PlanPage } from "../pages/PlanPage";
import { SettingsPage } from "../pages/SettingsPage";

export function App() {
  const { loading, error, snapshot, saveError } = useAppStore();

  if (loading) {
    return (
      <main className="boot-screen" aria-live="polite">
        <div className="boot-mark">R</div>
        <LoaderCircle className="spin" aria-hidden="true" />
        <strong>Preparing your journal</strong>
        <span>Checking history and local backups…</span>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="boot-screen recovery-screen">
        <div className="recovery-icon"><AlertTriangle aria-hidden="true" /></div>
        <h1>Your history was not replaced</h1>
        <p>{error || "The canonical database could not be opened."}</p>
        <div className="recovery-note">
          <Database aria-hidden="true" />
          <span>The legacy browser keys and workbook export remain untouched. Open <a href="./Reps.html">Legacy Reps.</a> to keep working while this is resolved.</span>
        </div>
        <button className="button primary" onClick={() => location.reload()}>Try again</button>
      </main>
    );
  }

  return (
    <>
    {saveError && <div className="data-error" role="alert">{saveError} Keep this page open and retry the edit.</div>}
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/train" element={<TrainPage />} />
        <Route path="/train/live/:sessionId" element={<WorkoutPage />} />
        <Route path="/train/session/:sessionId" element={<SessionPage />} />
        <Route path="/train/programs" element={<ProgramsPage />} />
        <Route path="/train/exercises" element={<ExerciseLibraryPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/progress/exercise/:exerciseId" element={<ExerciseProgressPage />} />
        <Route path="/nutrition" element={<NutritionPage />} />
        <Route path="/nutrition/foods" element={<FoodsPage />} />
        <Route path="/nutrition/energy" element={<EnergyPage />} />
        <Route path="/nutrition/:date" element={<NutritionPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
    </>
  );
}

