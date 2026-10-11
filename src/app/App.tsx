import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { SignIn } from "../auth/SignIn";
import { StoreProvider } from "../data/store";
import { supabase } from "../data/supabase";
import { Shell } from "./Shell";
import { TodayPage } from "../pages/TodayPage";
import { WorkoutPage } from "../pages/WorkoutPage";
import { TrainPage } from "../pages/TrainPage";
import { PlanPage } from "../pages/PlanPage";
import { CheckinPage } from "../pages/CheckinPage";
import { ProgressPage } from "../pages/ProgressPage";
import { RecordsPage } from "../pages/RecordsPage";
import { FoodPage } from "../pages/FoodPage";
import { WeightPage } from "../pages/WeightPage";
import { HistoryPage } from "../pages/HistoryPage";
import { SessionPage } from "../pages/SessionPage";
import { ExercisePage } from "../pages/ExercisePage";
import { FoodLibraryPage } from "../pages/FoodLibraryPage";
import { ExercisesPage } from "../pages/ExercisesPage";
import { WatchSettingsPage } from "../pages/WatchSettingsPage";

export function App() {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuth(session));
    return () => data.subscription.unsubscribe();
  }, []);

  // Dev-only demo: a throwaway local profile with sync off, for trying screens without an account.
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

  if (auth === undefined && !demo) return null;
  if (!auth && !demo) return <SignIn />;

  return (
    <StoreProvider userId={auth?.user.id ?? "demo-local"} offline={demo && !auth}>
      <HashRouter>
        <Routes>
          <Route path="/workout/:sessionId" element={<WorkoutPage />} />
          <Route element={<Shell email={auth?.user.email ?? "demo (not synced)"} />}>
            <Route index element={<TodayPage />} />
            <Route path="train" element={<TrainPage />} />
            <Route path="plan" element={<PlanPage />} />
            <Route path="checkin" element={<CheckinPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="food" element={<FoodPage />} />
            <Route path="weight" element={<WeightPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="session/:sessionId" element={<SessionPage />} />
            <Route path="exercise/:exerciseId" element={<ExercisePage />} />
            <Route path="food/library" element={<FoodLibraryPage />} />
            <Route path="exercises" element={<ExercisesPage />} />
            <Route path="settings/watch" element={<WatchSettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
