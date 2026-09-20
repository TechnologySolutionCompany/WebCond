// Conteudo das paginas legais do WebCond (Privacidade, Seguranca e Cookies).
// Texto em linguagem simples: quem usa o sistema e sindico e morador, nao advogado.
export const LAST_UPDATE = '20 de setembro de 2026'
export const POLICY_VERSION = '1.0'

export const POLICIES = {
  privacidade: {
    slug: 'privacidade',
    label: 'Privacidade',
    title: 'Politica de Privacidade',
    intro: 'Quais dados o WebCond guarda, por que guarda, com quem compartilha e o que voce pode pedir. Escrito conforme a LGPD (Lei 13.709/2018).',
    notice: 'O condominio e o responsavel pelos dados dos moradores (controlador). A Technology Solution Company BR trata esses dados em nome do condominio (operador), apenas para fazer o sistema funcionar.',
    sections: [
      {
        id: 'ambito',
        title: 'Ambito e definicoes',
        blocks: [
          { type: 'p', text: 'Esta politica vale para o WebCond: o site, o painel do sindico, o painel do morador e o painel da plataforma.' },
          { type: 'ul', items: [
            'Dado pessoal: qualquer informacao que identifique uma pessoa, como nome, CPF, telefone e e-mail.',
            'Titular: a pessoa a quem o dado se refere (sindico, proprietario, inquilino, contador).',
            'Controlador: o condominio, que decide quais dados cadastrar e para que.',
            'Operador: a TSCBr, que mantem o sistema e trata os dados seguindo as instrucoes do condominio.',
            'ANPD: Autoridade Nacional de Protecao de Dados.',
          ] },
        ],
      },
      {
        id: 'dados',
        title: 'Dados que o sistema guarda',
        blocks: [
          { type: 'p', text: 'Somente o necessario para administrar o condominio:' },
          { type: 'ul', items: [
            'Cadastro: nome, CPF, WhatsApp, e-mail, unidade e vinculo (proprietario ou inquilino).',
            'Condominio: nome, CNPJ ou CPF do responsavel, endereco, quantidade de unidades e dados do sindico e subsindico.',
            'Financeiro: cobrancas, valores, vencimentos, boletos, comprovantes enviados e confirmacoes de pagamento.',
            'Comunicacao: avisos publicados pelo sindico, documentos do condominio e ocorrencias abertas pelos moradores.',
            'Tecnicos: data e hora de acesso e registros minimos de funcionamento do servidor.',
          ] },
          { type: 'p', text: 'O sistema nao pede nem guarda dados de cartao, senha de banco, biometria ou localizacao.' },
        ],
      },
      {
        id: 'uso',
        title: 'Para que usamos',
        blocks: [
          { type: 'ul', items: [
            'Dar acesso ao painel e identificar quem entra.',
            'Emitir e acompanhar cobrancas, boletos e comprovantes.',
            'Publicar avisos e documentos para as unidades certas.',
            'Gerar relatorios e exportacoes para a prestacao de contas.',
            'Manter o servico no ar, apurar problemas e proteger contra acessos indevidos.',
          ] },
          { type: 'p', text: 'Nao usamos os dados para publicidade e nao vendemos dados para ninguem.' },
        ],
      },
      {
        id: 'bases',
        title: 'Bases legais',
        blocks: [
          { type: 'ul', items: [
            'Execucao de contrato: prestar o servico contratado pelo condominio.',
            'Obrigacao legal: guardar registros financeiros e fiscais pelo prazo exigido por lei.',
            'Legitimo interesse: seguranca do sistema, prevencao de fraude e melhoria do servico.',
          ] },
        ],
      },
      {
        id: 'compartilhamento',
        title: 'Com quem compartilhamos',
        blocks: [
          { type: 'ul', items: [
            'Supabase: banco de dados, contas de acesso e armazenamento de arquivos.',
            'Vercel: hospedagem do site e das rotas do sistema, com servidores em Sao Paulo.',
            'Autoridades: somente mediante ordem legal.',
          ] },
          { type: 'p', text: 'Cada condominio enxerga apenas os proprios dados. Um condominio nunca acessa dados de outro.' },
        ],
      },
      {
        id: 'seguranca',
        title: 'Seguranca',
        blocks: [
          { type: 'p', text: 'As protecoes estao descritas na Politica de Seguranca: separacao entre condominios no proprio banco, senhas guardadas em formato irreversivel, arquivos privados por condominio, conexao criptografada e CPF e telefone mascarados na tela.' },
        ],
      },
      {
        id: 'direitos',
        title: 'Seus direitos',
        blocks: [
          { type: 'p', text: 'Voce pode pedir a qualquer momento: confirmar se ha tratamento, acessar seus dados, corrigir, pedir anonimizacao ou exclusao e saber com quem foram compartilhados.' },
          { type: 'ul', items: [
            'Morador: o pedido de alteracao cadastral vai pelo proprio painel, em Meu perfil, e e o sindico quem atualiza.',
            'Sindico: fala direto com a TSCBr pelos canais do rodape.',
            'Prazo de resposta: ate 15 dias.',
          ] },
        ],
      },
      {
        id: 'retencao',
        title: 'Por quanto tempo guardamos',
        blocks: [
          { type: 'ul', items: [
            'Cadastro: enquanto a pessoa estiver vinculada a uma unidade. Ao sair, o acesso e desativado no mesmo instante.',
            'Cobrancas e comprovantes: 5 anos, por exigencia fiscal e de prestacao de contas.',
            'Avisos: apagados automaticamente 30 dias apos o envio.',
            'Encerrando o contrato do condominio, os dados sao apagados apos o periodo legal de guarda.',
          ] },
        ],
      },
      {
        id: 'cookies',
        title: 'Cookies',
        blocks: [
          { type: 'p', text: 'O WebCond usa somente armazenamento essencial (sessao de login e preferencias de tela). Os detalhes estao na Politica de Cookies.' },
        ],
      },
      {
        id: 'alteracoes',
        title: 'Alteracoes',
        blocks: [
          { type: 'p', text: 'Se esta politica mudar, a data desta pagina e atualizada. Mudancas relevantes sao avisadas ao sindico de cada condominio.' },
        ],
      },
    ],
  },

  seguranca: {
    slug: 'seguranca',
    label: 'Segurança',
    title: 'Politica de Seguranca',
    intro: 'Como o WebCond protege os dados de cada condominio e o que e testado a cada atualizacao.',
    notice: 'Regra principal: um condominio nunca enxerga dados de outro. Isso e garantido pelo proprio banco de dados, nao apenas pela tela.',
    sections: [
      {
        id: 'isolamento',
        title: 'Separacao entre condominios',
        blocks: [
          { type: 'p', text: 'Cada consulta ao banco passa por regras de acesso por linha, aplicadas dentro do proprio banco de dados. Mesmo que alguem monte uma requisicao por fora do site, so recebe os dados do condominio ao qual pertence.' },
          { type: 'p', text: 'Testamos isso com tres condominios ao mesmo tempo, com quatro papeis cada, sobre nove tabelas, a cada atualizacao.' },
        ],
      },
      {
        id: 'acessos',
        title: 'Acessos e papeis',
        blocks: [
          { type: 'ul', items: [
            'Sindico: administra o proprio condominio.',
            'Contador: apenas leitura, no painel e nos relatorios.',
            'Proprietario e inquilino: veem a propria unidade, as proprias cobrancas, avisos e documentos.',
            'Administrador da plataforma: gerencia cadastros e planos dos condominios.',
          ] },
          { type: 'p', text: 'Ninguem muda o proprio papel nem o proprio condominio: esses campos sao bloqueados pelo banco. O sindico tambem nao consegue promover alguem a administrador.' },
        ],
      },
      {
        id: 'senhas',
        title: 'Senhas e sessoes',
        blocks: [
          { type: 'ul', items: [
            'Senhas sao guardadas em formato irreversivel (hash) pelo servico de autenticacao; ninguem le a senha de ninguem, nem a equipe tecnica.',
            'Contas sao criadas somente pelo sistema; o cadastro publico direto no banco fica desativado.',
            'Login por CPF (morador) ou CNPJ (sindico) com senha, limitado por tentativas.',
            'Quem sai da unidade perde o acesso na mesma hora, mesmo com a sessao ainda aberta.',
          ] },
        ],
      },
      {
        id: 'api',
        title: 'Protecao das rotas do sistema',
        blocks: [
          { type: 'ul', items: [
            'Requisicoes vindas de outros sites sao recusadas.',
            'Limite de tentativas de login por IP e por documento, contra forca bruta.',
            'A chave com poder total sobre o banco fica somente no servidor; nunca chega ao navegador.',
            'Respostas do sistema nunca ficam em cache.',
          ] },
        ],
      },
      {
        id: 'arquivos',
        title: 'Documentos e boletos',
        blocks: [
          { type: 'ul', items: [
            'Os arquivos ficam em areas privadas, uma pasta por condominio.',
            'O acesso e liberado por link temporario para quem tem direito aquele arquivo.',
            'O sindico de um condominio nao le, grava nem apaga arquivo de outro.',
          ] },
        ],
      },
      {
        id: 'transmissao',
        title: 'Transmissao e navegador',
        blocks: [
          { type: 'ul', items: [
            'Todo o trafego e por HTTPS, com HSTS.',
            'Politica de conteudo (CSP) restringindo scripts, e bloqueio de exibicao dentro de iframes.',
            'Codigo-fonte do sistema nao e publicado junto com o site.',
          ] },
        ],
      },
      {
        id: 'mascaramento',
        title: 'Dados sensiveis na tela',
        blocks: [
          { type: 'p', text: 'CPF e telefone aparecem mascarados por padrao (exemplo: ***.456.789-** e (81) 9****-3724). O valor completo so aparece quando a pessoa clica para mostrar, o que evita exposicao com a tela aberta ou em apresentacoes.' },
          { type: 'p', text: 'Nas exportacoes de relatorio, feitas pelo sindico ou pelo contador, os dados saem completos, porque servem a prestacao de contas. O arquivo gerado e responsabilidade de quem exporta.' },
        ],
      },
      {
        id: 'testes',
        title: 'Testes a cada atualizacao',
        blocks: [
          { type: 'p', text: 'Antes de publicar, rodamos uma bateria automatizada que tenta invadir o sistema: acessar outro condominio, virar sindico, ler arquivos alheios, entrar sem login e quebrar senha por tentativa. A publicacao so acontece com todas as verificacoes aprovadas.' },
        ],
      },
      {
        id: 'incidentes',
        title: 'Incidentes',
        blocks: [
          { type: 'p', text: 'Suspeitou de acesso indevido ou encontrou uma falha? Fale com a gente pelos canais do rodape. Incidentes com risco aos titulares sao comunicados ao condominio e, quando exigido, a ANPD.' },
        ],
      },
      {
        id: 'responsabilidades',
        title: 'O que depende do condominio',
        blocks: [
          { type: 'ul', items: [
            'Guardar bem a senha do sindico e nao compartilhar o acesso.',
            'Cadastrar apenas dados necessarios e manter as unidades atualizadas.',
            'Remover da unidade quem nao mora mais la.',
            'Cuidar dos relatorios exportados, que saem com dados completos.',
          ] },
        ],
      },
    ],
  },

  cookies: {
    slug: 'cookies',
    label: 'Cookies',
    title: 'Politica de Cookies',
    intro: 'O que o WebCond guarda no seu navegador e para que serve.',
    notice: 'O WebCond nao usa cookies de publicidade, nem rastreamento, nem ferramentas de analise de terceiros.',
    sections: [
      {
        id: 'oque',
        title: 'O que sao',
        blocks: [
          { type: 'p', text: 'Sao pequenos arquivos que um site guarda no navegador para lembrar informacoes entre uma visita e outra. O WebCond usa principalmente o armazenamento local do navegador, que funciona do mesmo jeito e fica so no seu aparelho.' },
        ],
      },
      {
        id: 'usamos',
        title: 'O que guardamos',
        blocks: [
          { type: 'ul', items: [
            'Sessao de login: mantem voce conectado enquanto usa o sistema. Sem isso nao ha como entrar.',
            'Tema claro ou escuro: lembra a sua escolha.',
            'Menu lateral recolhido: lembra como voce deixou a tela.',
            'Aviso de plano dispensado: evita repetir o mesmo aviso no mesmo dia.',
          ] },
          { type: 'p', text: 'Todos sao essenciais ou de preferencia. Nenhum identifica voce para terceiros.' },
        ],
      },
      {
        id: 'terceiros',
        title: 'Terceiros',
        blocks: [
          { type: 'p', text: 'A sessao de login e gerenciada pelo Supabase, que hospeda o banco e a autenticacao. A hospedagem e da Vercel. Nenhum dos dois recebe dados para publicidade.' },
        ],
      },
      {
        id: 'duracao',
        title: 'Duracao',
        blocks: [
          { type: 'ul', items: [
            'Sessao de login: expira sozinha; sair do sistema encerra na hora.',
            'Preferencias de tela: ficam ate voce limpar os dados do navegador.',
          ] },
        ],
      },
      {
        id: 'gerenciar',
        title: 'Como gerenciar',
        blocks: [
          { type: 'p', text: 'Voce pode limpar os dados do site pelas configuracoes do navegador. Ao fazer isso voce sai do sistema e as preferencias de tela voltam ao padrao. Bloquear o armazenamento impede o login, porque a sessao nao tem onde ficar.' },
        ],
      },
      {
        id: 'direitos',
        title: 'Seus direitos',
        blocks: [
          { type: 'p', text: 'Como nao ha rastreamento nem publicidade, nao existe perfil de navegacao para consultar ou excluir. Os direitos sobre os dados cadastrais estao na Politica de Privacidade.' },
        ],
      },
      {
        id: 'alteracoes',
        title: 'Alteracoes',
        blocks: [
          { type: 'p', text: 'Se passarmos a usar algum recurso novo que precise de cookies, esta pagina e atualizada antes e, se a lei exigir, o consentimento e pedido na tela.' },
        ],
      },
    ],
  },
}

export const POLICY_LIST = Object.values(POLICIES)
