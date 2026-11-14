// Se carga en <head> ANTES de pintar la página: aplica el tema guardado para que no haya
// un "parpadeo" oscuro -> claro al recargar. Es un archivo aparte porque la CSP no permite scripts en línea.
(function () {
  var preferido = "sistema";
  try {
    preferido = localStorage.getItem("tema") || "sistema";
  } catch (e) {}
  var oscuro = preferido === "oscuro" || (preferido === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
})();
