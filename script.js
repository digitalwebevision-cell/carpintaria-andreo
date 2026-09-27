document.addEventListener("DOMContentLoaded", () => {

    const intro = document.getElementById("intro");
    const enterButton = document.getElementById("enter-site");

    let introFinished = false;


    function enterSite() {

        if (introFinished) {
            return;
        }

        introFinished = true;

        intro.classList.add("hide");

        document.body.style.overflow = "auto";
    }


    /*
        Clique na tela inteira
        também pula a abertura.
    */

    intro.addEventListener("click", (event) => {

        if (event.target === enterButton) {
            enterSite();
            return;
        }

        enterSite();

    });


    /*
        Entrada automática.
        Aproximadamente 7 segundos.
    */

    setTimeout(() => {

        enterSite();

    }, 7000);

});