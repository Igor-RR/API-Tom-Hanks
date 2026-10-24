# Atenas SGE — Software de Gestão Empresarial

> Valores marcados com *(hipótese)* são dados mockados ou estimativas a validar com uma empresa real.

**Atenas SGE é o software de gestão empresarial em que pequenas indústrias cadastram projetos, itens e demandas de montagem, almoxarifado e usinagem num só lugar, e cada pessoa vê só o que precisa para trabalhar ou decidir.**

---

## 1. A dor

**Quem sofre:** o gestor de produção (gerente, encarregado, chefe de setor) de uma empresa industrial pequena, e o funcionário que recebe as demandas.

**Quando:** todo dia, na distribuição das tarefas entre montagem, almoxarifado e usinagem, e a cada projeto novo, quando é preciso decidir quantas pessoas alocar.

**Quanto custa hoje** *(hipótese)*:

- **Sobrecarga (a dor central):** a demanda chega sem filtro e cai sempre nos mesmos funcionários, porque o gestor não enxerga a carga de cada um. O resultado é cansaço, erro, retrabalho e risco de afastamento ou saída da pessoa.
- **Tempo:** o gestor gasta horas por semana consolidando planilhas e conferindo com o chão de fábrica o que está pendente.
- **Dinheiro:** sem saber quantos funcionários o projeto exige, a empresa alterna hora extra num dia e ociosidade em outro.
- **Risco:** informação faltando compromete a decisão (o gestor não vê o todo) e informação demais atrapalha a operação (o funcionário se perde no que não é dele).

**Como se resolve hoje:** planilhas em Excel, quadro de papel, mensagens de WhatsApp e memória do encarregado. Cada atividade tem seu controle e nenhum se conversa.

## 2. Persona

**Carlos Mendes, 42 anos, encarregado de produção** de uma metalúrgica com cerca de 25 funcionários *(fictício)*.

Ele começa o dia anotando num caderno as demandas de usinagem, montagem e almoxarifado, e depois passa tudo para uma planilha que só ele entende. Quando entra um projeto novo, decide de cabeça quantas pessoas colocar, e às vezes erra para mais ou para menos. O funcionário pergunta a ele o que fazer porque não tem onde consultar. As demandas chegam sem filtro e acabam sempre nos mesmos operadores, porque ele não enxerga a carga de cada um. O que atrapalha: nenhum sistema mostra o projeto, os itens e quem está com cada demanda no mesmo lugar, e os sistemas de gestão (ERP/MES) que conhece são caros e pesados para o tamanho da empresa.

**Persona secundária, o funcionário:** Marcos, 28 anos, operador de usinagem. Só precisa saber qual é a demanda dele hoje, de qual projeto e com quais itens.

## 3. Concorrentes e alternativas

| Alternativa | O que faz mal para essa persona |
|---|---|
| Planilha (Excel / Google Sheets) | Cada setor tem a sua, sem controle de quem vê o quê, sem alerta e sem previsão. Um erro de digitação passa despercebido. |
| Quadro de papel e WhatsApp | Não deixa histórico, as informações se perdem e o funcionário vê (ou perde) mensagens que não são dele. |
| Trello / Asana | Genéricos: não têm o conceito de projeto com itens (RG, quantidade) nem de demanda por atividade produtiva, e não indicam quantos funcionários alocar. |
| ERP / MES (ex.: TOTVS, SAP) | Caros, com implantação longa, muita informação em cada tela e exigem equipe de TI. Excessivos para uma operação pequena. |

## 4. Proposta de valor

**Para a pequena indústria, o Atenas SGE reúne projetos, itens e demandas num só lugar com acesso por papel, e no plano Expert indica quantos funcionários o próximo projeto exige, evitando a sobrecarga da equipe, sem o custo e a complexidade de um ERP.**

## 5. Modelo de receita com Stripe

O plano **é** o papel do usuário, como no projeto anterior: pagar o Expert muda o papel, e o middleware de acesso passa a liberar os recursos. O papel só muda quando o **webhook** do Stripe confirma o pagamento.

| | **Professional** | **Expert** |
|---|---|---|
| Preço | Grátis | R$ 149/mês por conta |
| Cadastrar processos, itens e projetos | Sim | Sim |
| Ver as próprias demandas | Sim | Sim |
| Projetos ativos ao mesmo tempo *(hipótese)* | Até 3 | Sem limite |
| Itens por projeto *(hipótese)* | Até 50 | Sem limite |
| Demandas abertas ao mesmo tempo *(hipótese)* | Até 20 | Sem limite |
| Excluir demandas | Não | Sim |
| Painel de indicadores | Não | Sim |
| Painel de previsão de equipe (regressão linear múltipla: nº de funcionários por características do projeto) | Não | Sim |

**Por que alguém pagaria o Expert:** o plano Professional já resolve o registro e a consulta, mas o limite de 3 projetos ativos aperta quando a operação cresce, e só o Expert ajuda a decidir. A previsão de pessoas por projeto e o painel evitam hora extra e sobrecarga, e o custo mensal tem que ser menor que uma hora extra evitada *(hipótese a validar)*.

**Funil:** o plano Professional gera o histórico de projetos que o modelo de regressão precisa para funcionar. A regressão usa dados mockados no início e se ajusta conforme novos projetos são inseridos. Os limites do plano Professional contam só os projetos e demandas **ativos**: o que é concluído sai da contagem e continua alimentando a regressão, então o limite não atrapalha o funil.

**Como a previsão funciona:** é uma **regressão linear múltipla**. As variáveis de entrada são as características do projeto (nº de itens, quantidade total de unidades, nº de atividades envolvidas entre montagem, almoxarifado e usinagem, e prazo em dias) e a variável prevista é o **número de funcionários** necessários. O modelo começa com dados mockados e é reajustado a cada projeto concluído cujo número real de funcionários é informado. O resultado aparece no **painel de previsão de equipe**, exclusivo do Expert.

## 6. Métricas de sucesso

- **Contas cadastradas** e quantas ativas por semana.
- **Conversão** de Professional para Expert.
- **Assinantes Expert** e **MRR** (receita recorrente mensal).
- **Retenção** mensal dos assinantes Expert.
- **Projetos cadastrados por conta** (sem histórico a regressão não funciona).
- **Qualidade da previsão:** erro médio entre o nº de funcionários previsto e o realmente usado.
- **Sobrecarga:** horas extras por funcionário e demandas simultâneas por pessoa, antes e depois de usar o sistema.

## 7. Lean Canvas

| Bloco | Atenas SGE |
|---|---|
| **Problema** | 1) Demandas espalhadas em planilha, papel e WhatsApp. 2) O gestor não sabe quantas pessoas alocar por projeto. 3) A demanda sobrecarrega os funcionários, que ainda recebem informação demais ou de menos. Hoje: planilha e memória. |
| **Segmentos de clientes** | Empresas industriais pequenas com atividades de montagem, almoxarifado e usinagem. Primeiros adotantes: gestores e encarregados sem ERP. |
| **Proposta única de valor** | Gestão de demandas simples, com acesso por papel e previsão de equipe por projeto, sem a complexidade de um ERP. |
| **Solução** | 1) Cadastro de projetos, itens e demandas, com cada pessoa vendo as suas. 2) Acesso por papel: cada pessoa vê só o necessário. 3) Painel de previsão de equipe com regressão linear múltipla, mais indicadores (Expert). |
| **Canais** | Visitas a pequenas indústrias da região, indicação entre gestores, landing page. |
| **Fontes de receita** | Assinatura mensal Expert via Stripe. O plano Professional é a porta de entrada. |
| **Estrutura de custos** | Infraestrutura (mesma stack), taxas do Stripe, tempo de desenvolvimento e suporte. |
| **Métricas-chave** | Contas ativas, conversão para Expert, MRR, retenção, projetos por conta. |
| **Vantagem injusta** | O histórico acumulado de projetos: quanto mais o cliente usa, melhor fica a previsão e mais caro é sair. Conhecimento do chão de fábrica da região. |

## 8. Papéis e permissões

Informação demais atrapalha o operacional e informação faltando compromete a decisão, então cada papel enxerga o necessário e nada além. Os papéis são **cumulativos**: cada um faz o que o anterior faz, mais o que é seu.

| Papel | Quem é | Pode fazer |
|---|---|---|
| `professional` | Todo usuário novo (plano gratuito) | Cadastrar processos, itens e projetos, dentro dos limites do plano; ver **só as próprias demandas** |
| `expert` | Assinante do plano pago (em geral o gestor) | Tudo do Professional **+** painel de indicadores, painel de previsão de equipe (regressão linear múltipla) e exclusão de demandas |
| `admin` | Administrador do produto, usado para testar rotas | Tudo do Expert. Não é vendável e não aparece na página de planos |

## 9. Mapa de reaproveitamento

| Peça do projeto atual | O que vira no Atenas SGE |
|---|---|
| Catálogo de filmes (TMDB) | Recurso principal: **projetos, itens** (RG, quantidade, id do projeto) e **demandas** por atividade (montagem, almoxarifado, usinagem) |
| Tier list dos stalkers | **Painel de previsão de equipe** (Expert): tela com a previsão da regressão linear múltipla por projeto |
| Serviço e pasta `catalogo` | Renomeado para **`app`**: continua sendo o único serviço público e a porta de entrada dos demais serviços |
| Login + RBAC | Papéis `professional` < `expert` < `admin`, cumulativos como hoje. O `exigirNivel` e o padrão de claims no JWT continuam |
| Logs e auditoria (Redis) | Eventos de negócio: "projeto criado", "item cadastrado", "demanda criada", "demanda excluída", `acesso_negado`. Consulta restrita ao `admin` |
| Upload e perfil (Garage) | Foto do usuário e, depois, anexos do projeto (desenho técnico, foto da peça) |
| Plano Expert (Stripe) | Plano Expert único: o pagamento muda o papel de `professional` para `expert` |
| CI/CD (GitHub Actions) | Continua valendo: build, teste e publicação das imagens a cada push |
| **Novo:** microsserviço de regressão | Serviço isolado (Python) com regressão linear múltipla: recebe as características do projeto e devolve o número de funcionários previsto |

## 10. Próximos passos

O backlog está nas issues deste repositório e é o roteiro das atividades 10 (negócio no ar) e 11 (assinatura com Stripe).
