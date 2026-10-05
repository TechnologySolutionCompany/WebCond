Ajustes na tela inicial do WebCond

Entrar por E-mail, tornar email obrigatorio durante o cadastro.
Por ser foco em PWA para app mobile adicionado ao celular ele fica com bastante informações na tela inicial. A ideia é ficar minimalista de forma simplificada...
E na tela de cadastro mostrar as informações como tem no Roda-PE

com tudo, A parte de loguin por Email manten-se obrigatoria, apenas em caso de não conseguir acessar por esquecer o email, ai sim informa o CPF parra poder acessar com CPF + Senha
Em suporte, deve ter a opção de "Sobre" aonde vai ficar todas as informações do projeto WebCond, verão atual link para contato com o suporte direto da TSCBr desenvolvedora.

Validei também que se eu abro alguma coisa dentro do app saiu e volto ele retorna a tela inicial o painel inicial. Deve permanecer na ultima coisa que foi aberta, facilitando o usuario abrir um boleto por exemplo que é gerado na area externa no navegador e retorar extamente aonde estava.

Pagamento...
Vamos adicionar o banco "infinitepay" para gerar o pagamento, verifiquei que ele é um pouco mais simplificado... Me sinalize oque você precisa para dar o andamento a isto... no meu condominio

Porém eu acredito que nem todos os demais condominios utilizem o mesmo banco. Então como poderiamos fazer isto, qual seria melhor ideia para isto ?

a cerca de eu vender o acesso a plataforma qual banco eu poderia utilizar ?
Plano One
Plano Pro
Plano Max
qual banco eu coloco para receber isto ?

Quero gerar um novo modelo de boleto de cobrança, com tudo se a cobrança for feita via o banco a api do infinitepay por exemplo, não precisaria do boleto pois com isto teria meio que uma redundancia. mais seria bom para usar  como comprovação que foi realizada a cobrança, fora que tem algumas unidades que ficam inadiplentes etc.. então quero realmente criar algo que possamos aplicar como boleto mensal mesmo que seja gerado mensalmente a cobrança via api do banco..
Ou podemos apenas deixar um espaço para o síndico colocar as informações do seu banco. Com tudo poderia padronizar um unico banco colocando a API dele no sistema inteiro apenas designiando cada pessoa para receber. Condomínio 1 - banco inifinitepay, Condomínio 2 - Nubank, Condomínio 3 - Caixa
não sei muito bem sobre isto. mais o boleto quero algo padronizado para o condomínio

prompt para o boleto personalizado "Implemente a geração da fatura usando fatura-template.html como template Handlebars, alimentado pelos dados do banco no formato de fatura-exemplo.json. Gere o PDF em A4 com Puppeteer. O gráfico dos últimos 3 meses e a lista de unidades em aberto vêm dos pagamentos confirmados pelo banco, e o QR code Pix vem da integração bancária."

Vamos também colocar para o condomínio novo cadastrado se auto autorizar o acesso.
Ou seja o novo condominio se cadastra ele vai automaticamente entrar em modo de teste..
Após cadastrar o email dele ele recebe uma mensagem via email para confirmar

O email deve ser algo do tipo:

Bem Vinda(a) [nome do síndico cadastrado] com [nome do condomínio cadastrado].
Esta mensagem é automatica para você confirmar seu acesso a plataforma do WebCond.

Botão Confirmar cadastro.
Após confirmar o acesso dele como Síndico(a) é liberado a plataforma para o mesmo acessar e cadastar as demais coisas..

Validei também que mesmo sendo PWA web, na tela inicial precisa ficar retirando zoom que fica dado e quando clico para digitar ele dar um outro zoom também, quero que seja bem adaptativo ao modelo do celular mantendo o padrão visual e organizacional do sistema.

Após tudo ser aplicado será o ajuste A5 após isso iremos para as definições do plano Pro que será:
Versão do App: v2.10A1

só quando começarmos a mexer na parte do plano Pro as melhorias.

Vamos adicionar também uma parte de Feedback aonde todos podem mandar feedback direto para o administrador.