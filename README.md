# Vistoria de Imóveis

Aplicativo para elaborar **laudos de vistoria de imóveis para locação**: vistoria prévia (entrada) e vistoria de entrega de chaves, com descrição e fotos cômodo a cômodo e geração do laudo em PDF, pronto para assinatura.

**Acesse:** https://felippealvarez.github.io/Vistoria/

Funciona no celular (Android e iPhone) e no computador, pode ser **instalado como aplicativo** e funciona **sem internet** depois de instalado.

---

## Como instalar

| Aparelho | Como fazer |
|---|---|
| **Android** (Chrome) | Abra o link acima e toque em **Instalar aplicativo** (no topo da tela) ou, no menu ⋮, em **Instalar app** / **Adicionar à tela inicial**. |
| **iPhone / iPad** (Safari) | Abra o link, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**. |
| **Computador** (Chrome ou Edge) | Abra o link e clique em **Instalar aplicativo** no topo da tela ou no ícone de instalar na barra de endereço. |

Depois de instalado, o aplicativo abre com ícone próprio, em janela própria, sem barra de endereço.

## O que o aplicativo faz

- **Tela inicial** com acesso direto a: nova vistoria prévia, nova vistoria de entrega, minhas vistorias, laudos de outras pessoas, cadastro do responsável e configurações.
- **Dois tipos de vistoria:** prévia (entrada) e entrega de chaves. A partir de uma vistoria prévia, é possível criar a de entrega com os mesmos dados e cômodos.
- **Dados do imóvel e das partes:** endereço (rua, número, complemento, bairro, cidade e UF), locatário e locador com CPF/CNPJ, vistoriador, contrato, chaves e leituras de água, energia e gás.
- **Um cômodo por aba**, com estado geral, descrição e fotos com legenda (tiradas na hora pela câmera ou escolhidas da galeria). Cômodos repetidos são numerados automaticamente (Quarto 01, Quarto 02…).
- **Ditado por voz** (botão 🎤) na descrição dos cômodos, nas legendas das fotos e nas observações gerais. Usa o reconhecimento de voz do navegador (Chrome, Edge ou Safari) e **só funciona com internet**.
- **Acompanhamento da vistoria prévia:** indica se o locatário acompanhou ou não; se não acompanhou, o laudo informa o prazo de 10 dias para manifestar discordância.
- **Declaração final editável** em cada vistoria, a partir de um texto padrão.
- **Cabeçalho personalizado** com logo, nome e contato de quem elabora a vistoria.
- **Laudo em PDF** com textos justificados, fotos numeradas, rubrica e numeração em todas as páginas e espaço para assinaturas. É possível **visualizar**, **salvar** e **compartilhar** (WhatsApp, e-mail etc.) o PDF.
- **Pasta para salvar os PDFs** (no computador, com Chrome ou Edge). No celular, os PDFs vão para Downloads ou para onde você escolher ao compartilhar.
- **Troca de laudos entre pessoas:** o botão **Enviar p/ edição** gera um arquivo do laudo (com fotos) que outra pessoa abre no aplicativo em **Laudos de outras pessoas** e continua editando. No computador, é possível usar uma **pasta compartilhada** (Google Drive, OneDrive ou Dropbox sincronizados): o aplicativo lista os laudos que estão nela e importa com um clique.
- **Backup** de todas as vistorias num único arquivo, que pode ser importado em outro aparelho.

## Privacidade e armazenamento

As vistorias, fotos e dados pessoais **ficam guardados somente no aparelho** onde foram preenchidos. Nada é enviado para servidores, nem para este repositório.

Por isso:

- cada aparelho tem as suas próprias vistorias; para passar de um aparelho para outro, use **Minhas vistorias → Backup de todas** e, no outro aparelho, **Laudos de outras pessoas → Importar arquivo**;
- ao usar **Enviar p/ edição**, o arquivo do laudo contém os dados das partes e as fotos: envie apenas para quem deve ter acesso a eles;
- limpar os dados do navegador ou desinstalar o aplicativo apaga as vistorias salvas; **faça backup com frequência**.

## Estrutura do projeto

| Arquivo | Função |
|---|---|
| `index.html` | O aplicativo (interface, armazenamento e geração do PDF). |
| `manifest.webmanifest` | Nome, ícones e cores usados na instalação. |
| `sw.js` | Guarda o aplicativo no aparelho para funcionar sem internet. |
| `lib/` | Bibliotecas de terceiros: [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 (licença MIT), que gera o PDF, e [pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 (licença Apache 2.0), que exibe a prévia. |
| `icons/` | Ícones do aplicativo. |

## Como publicar uma nova versão

1. Substitua os arquivos alterados neste repositório (normalmente só o `index.html`).
2. O GitHub Pages atualiza o site em 1 a 2 minutos.
3. Os aparelhos com o aplicativo instalado recebem a nova versão na próxima vez que o abrirem com internet.

Se trocar arquivos da pasta `lib/` ou `icons/`, aumente também o número de `VERSAO` no início do `sw.js`.
