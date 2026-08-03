window.CHIBI_WEB_CONFIG = {
  // Replace only after the asset host has passed the in-page CORS check.
  assetOrigin: "https://storage.sekai.best/sekai-jp-assets",
  catalogOrigin: "https://sekai-world.github.io/sekai-master-db-diff",
  // GitHub Pages has no database, so the public edition uses CounterAPI for
  // the optional view badge and its historical bucket list.
  viewStats: {
    enabled: true,
    apiBase: "https://api.counterapi.dev/v1",
    namespace: "mikansei39",
    counter: "SekaiChibiStudioViews",
    sessionKey: "sekai-chibi-studio-view-recorded-v1",
  },
};
