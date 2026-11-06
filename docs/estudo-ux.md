# Estudo de UX do Life Track

Revisão da interface feita em novembro de 2026, sobre o design atual: modo escuro no estilo Apple, um único destaque laranja.

## Como foi feito

- **Referências:** Human Interface Guidelines da Apple (modo escuro, cores do sistema, barras laterais, controles segmentados, folhas e movimento) e WCAG 2.2 nível AA.
- **Skills de revisão:** acessibilidade (`better-accessibility`), revisão de interface (`better-interface`), cores (`better-colors`), microinterações (`micro-interaction`) e polimento (`make-interfaces-feel-better`).
- **Medição, não impressão:**
  - axe-core 4.10 rodando nas telas principais: resumo, indicador semanal, indicador em 30 dias, cada categoria, treinos e um treino;
  - percurso só com Tab;
  - largura de 320 px;
  - testes de fluxo com Playwright.
- **Limitação:** as páginas da HIG no site da Apple só carregam com JavaScript. Os valores usados (cores de modo escuro, 44 pt de alvo de toque, controle segmentado, folha) são os padrões publicados pela Apple que eu já conhecia, e não foram conferidos de novo nas páginas.

## O que foi encontrado

Gravidade: **alta** impede ou engana; **média** atrapalha; **baixa** é acabamento.

| # | Gravidade | Onde | Problema | Correção |
|---|---|---|---|---|
| 1 | Alta | Rodapé da barra lateral, eixos dos gráficos, rótulos dos dias | 21 textos com contraste entre 2,26:1 e 2,48:1, abaixo dos 4,5:1 exigidos | Texto pequeno passou a usar o rótulo secundário da Apple (branco a 60%); o terciário ficou só para o que é decorativo ou desativado. O menor texto subiu de 11 para 12 px |
| 2 | Alta | Cartões | Eram `article` com `role="link"`: sem Cmd+clique, sem "abrir em nova aba", e o leitor de tela anunciava só o título | Viraram links de verdade (`<a href>`), com nome acessível "Sono: 6h23" |
| 3 | Alta | Tabelas de treinos e de dias | Linhas clicáveis só com o mouse; pelo teclado não havia como abrir um treino | O nome do treino e a data viraram links; a linha continua clicável |
| 4 | Alta | Resumo | Sem aviso de que os dados estavam velhos: a tela mostrava 2 de novembro no dia 6 sem explicar | Marca discreta ao lado da data ("relógio sem sincronizar há 4 dias"), com a instrução ao passar o mouse |
| 5 | Média | Arquitetura | "Sinais vitais", "Corpo" e "Nutrição" repetiam os mesmos cartões em ordens diferentes; "Sono" era o único atalho direto para um indicador; Passos, Estresse e Body Battery não tinham lugar na navegação | Barra lateral em três grupos, como no app Saúde: Resumo; Categorias (Recuperação, Sono, Atividade, Coração, Corpo, Nutrição); Registros (Treinos). Cada indicador pertence a uma categoria só |
| 6 | Média | Resumo | 16 cartões fixos e um calendário que repetia o seletor de data do topo | Botão "Editar", como no app Saúde: você escolhe os cartões, e a escolha fica salva no navegador. O calendário saiu, e o seletor do topo ganhou um calendário nativo ao clicar na data |
| 7 | Média | Página do indicador | Escolher um dia no gráfico atualizava os detalhes lá embaixo, fora da tela, e parecia que nada tinha acontecido | Os detalhes do dia vêm logo abaixo do gráfico; a lista dos sete dias vem depois |
| 8 | Média | Página do indicador | O "voltar" sempre levava ao Resumo, mesmo quando você vinha de uma categoria | O "voltar" leva para onde você estava, com o nome certo |
| 9 | Média | Atualizar | Nenhum retorno ao terminar | Aviso "Dados atualizados" (anunciado ao leitor de tela) e "Atualizado às 14:14" na barra lateral |
| 10 | Média | Carregamento | Só um texto "Buscando..." | Esqueleto com a forma da página |
| 11 | Média | Busca | Só o Enter funcionava; setas não navegavam; nada informava o atalho | Busca no padrão combobox: ↑ ↓ escolhem, Enter abre, Esc fecha, ⌘K foca de qualquer lugar; "Nada encontrado" quando não há resultado |
| 12 | Média | Cartões | O percentual (↓ 71%) comparava o dia ainda em andamento com dias completos e não dizia contra o quê | Some quando o dia está em andamento; tem a explicação "Comparado com a média dos 14 dias anteriores" e o sentido ("acima/abaixo") para o leitor de tela |
| 13 | Baixa | Cartões | Cada subtítulo repetia a data que já está no topo | Subtítulo só traz o que acrescenta ("Até agora", "mínimo 31") |
| 14 | Baixa | Estrutura | Títulos pulavam de nível; o mapa marcado como imagem tinha botões dentro; uma coluna de tabela sem nome; nenhum atalho para pular o menu | Títulos em ordem, mapa como região, coluna nomeada, "Pular para o conteúdo" como primeiro item do Tab |
| 15 | Baixa | Toque | Setas de 34 px | 44 px em telas de toque, como pede a HIG |

## O que foi mantido de propósito

- O visual aprovado: preto, cartões `#1C1C1E`, fonte do sistema e um único destaque laranja. As chaves da folha "Editar" usam o laranja no lugar do verde do iOS, para manter uma cor só.
- Body Battery, sono, passos e estresse vêm primeiro em toda grade, lista e categoria.
- Os mesmos tamanhos de cartão.

## Verificação

- axe-core nas 10 telas: **nenhuma violação** depois das correções. Antes eram 21 de contraste, 14 de papel ARIA, 2 de ordem de títulos, 1 de mapa e 1 de tabela.
- Tab na home: "Pular para o conteúdo" → busca → navegação → Atualizar → Editar → Hoje → dia anterior, seletor, próximo → cartões.
- Fluxos testados: editar o resumo e ver o cartão sumir; abrir um indicador pela categoria e voltar para ela; Shift+← troca de semana; ⌘K + "peso" + Enter leva ao Corpo; o endereço antigo `#/vitais` abre Coração.
- 320 px sem rolagem lateral; zero erros de console.
- **Não verificado:** leitor de tela real (VoiceOver), zoom de 200% e modo de alto contraste do Windows.

## Próximos passos sugeridos

1. Testar com VoiceOver (Cmd+F5) os gráficos da semana; pode valer uma tabela oculta por gráfico.
2. Permitir reordenar os cartões em "Editar" (hoje só liga e desliga).
3. Atalhos de teclado para as categorias (1 a 6) no Mac.
