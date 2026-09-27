from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Any


@dataclass
class ModuleItem:
    name: str
    width: int
    height: int
    depth: int
    category: str = "custom"
    accessories: List[str] = field(default_factory=list)


@dataclass
class ProjectContext:
    environment: str = "cozinha"
    material: str = "MDF"
    finish: str = "Carvalho"
    modules: List[ModuleItem] = field(default_factory=list)
    room_width: int = 320
    room_depth: int = 240
    room_height: int = 270


class ClientPlannerAssistant:
    """Agente de apoio para aconselhamento do cliente no configurador."""

    def __init__(self, project: ProjectContext | None = None):
        self.project = project or ProjectContext()

    def _suggest_by_environment(self) -> str:
        env = self.project.environment.lower()
        if env == "cozinha":
            return "Sugiro uma base com 2 a 3 módulos inferiores, 2 superiores e uma bancada funcional para manter fluxo e organização."
        if env == "roupeiro":
            return "Recomendo dividir o espaço em áreas de pendurar, gavetas e prateleiras; isso melhora organização e visual com menos volume." 
        if env == "sala":
            return "Uma estrutura com móveis de TV e estantes laterais funciona bem para equilibrar o ambiente sem sobrecarregar a parede."
        if env == "quarto":
            return "Para quarto, vale priorizar arrumação vertical e elementos mais discretos, mantendo a sensação de amplitude."
        if env == "escritorio":
            return "Uma mesa com armazenamento lateral e uma prateleira compacta costuma criar um ambiente funcional sem congestionar o espaço."
        return "Sugiro manter a composição principal forte e reduzir extras para preservar a proporção do ambiente."

    def _style_recommendation(self) -> str:
        finish = self.project.finish.lower()
        if finish in {"carvalho", "nogueira", "freijó"}:
            return "O acabamento quente transmite sensação de sofisticação e acolhimento, ideal para espaços premium."
        if finish in {"branco", "cinza"}:
            return "O visual mais claro amplia a percepção do ambiente e funciona muito bem em espaços pequenos." 
        if finish == "preto":
            return "O acabamento escuro cria um aspecto contemporâneo e elegante, mas exige equilíbrio com iluminação adequada."
        return "Mantém uma linha visual neutra que funciona bem em quase todos os projetos."

    def build_summary(self) -> str:
        modules_total = len(self.project.modules)
        total_storage = sum((m.width * m.height * m.depth) for m in self.project.modules)
        return (
            f"Ambiente: {self.project.environment}\n"
            f"Material: {self.project.material}\n"
            f"Acabamento: {self.project.finish}\n"
            f"Módulos: {modules_total}\n"
            f"Volume estimado: {total_storage} mm³\n"
            f"Recomendação: {_suggest_by_environment()}\n"
            f"Estilo: {_style_recommendation()}"
        )

    def answer_client_question(self, question: str) -> str:
        q = question.lower()

        if "mais" in q and "armazenamento" in q:
            return "Sugiro aumentar a altura do móvel e incluir prateleiras ou gavetas mais profundas em zonas de uso frequente."
        if "mais" in q and "bonito" in q:
            return "O melhor resultado visual costuma vir de linhas contínuas, acabamento uniforme e iluminação discreta no interior do módulo."
        if "menos" in q and "gastar" in q:
            return "Reduza acessórios decorativos e mantenha a estrutura principal, priorizando armazenamento funcional e acabamento muito bem escolhido."
        if "gaveta" in q or "prateleira" in q:
            return "Esses elementos ajudam muito na organização e deixam o ambiente mais funcional sem perder a estética."
        if "material" in q or "acabamento" in q:
            return self._style_recommendation()

        return self._suggest_by_environment()


if __name__ == "__main__":
    project = ProjectContext(
        environment="cozinha",
        material="MDF",
        finish="Carvalho",
        modules=[
            ModuleItem("Módulo inferior 450", 450, 860, 600, "base", ["Portas", "Gavetas"]),
            ModuleItem("Armário superior 450", 450, 720, 350, "upper", ["Prateleiras"]),
        ],
    )

    assistant = ClientPlannerAssistant(project)
    print(assistant.build_summary())
    print("\nResposta: ", assistant.answer_client_question("quero algo bonito e funcional"))
