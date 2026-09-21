import { initAuth } from "./shared/auth.js";
import { initNav, bootActiveModule } from "./shared/router.js";
import { resetState as resetMaisonState } from "./maison/data.js";
import { resetState as resetTresorerieState } from "./tresorerie/data.js";
import { resetState as resetMaladieState } from "./maladie/data.js";
import { resetState as resetEauState } from "./eau-elec/data.js";
import { hasOpeningBalance, invalidateWalletCache, loadWalletData } from "./shared/wallet.js";

initNav();

initAuth({
  onSignedOut: async () => {
    resetMaisonState();
    resetTresorerieState();
    resetMaladieState();
    resetEauState();
    invalidateWalletCache();
    const maison = await import("./maison/boot.js");
    const tresorerie = await import("./tresorerie/boot.js");
    const maladie = await import("./maladie/boot.js");
    const eauElec = await import("./eau-elec/boot.js");
    maison.resetModule();
    tresorerie.resetModule();
    maladie.resetModule();
    eauElec.resetModule();
    document.getElementById("main").innerHTML = "";
    document.getElementById("subtabs").innerHTML = "";
  },
  onAuthenticated: async () => {
    await loadWalletData();
    if (!hasOpeningBalance()) sessionStorage.setItem("ezz-module", "tresorerie");
    await bootActiveModule();
  },
});
