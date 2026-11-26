// Páginas públicas: Política de Privacidade (/privacidade) e Termos de Uso (/termos).
// A Meta exige a política para aprovar o app do WhatsApp.
import type { ReactNode } from "react";

const EMPRESA = {
  razao: "CHRONOS TECH LTDA",
  fantasia: "Chronos Tech",
  produto: "ChronosAuto",
  cnpj: "68.305.351/0001-44",
  endereco: "Rua João Cordeiro, 3069, Joaquim Távora, Fortaleza/CE, CEP 60110-535",
  email: "chronostech965@gmail.com",
  site: "https://chronosauto.com.br",
  atualizado: "26 de novembro de 2026",
};

function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", color: "#111827", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "48px 20px 64px", lineHeight: 1.65, fontSize: 16 }}>
        <a href="/" style={{ fontSize: 14, color: "#2563EB", textDecoration: "none" }}>← {EMPRESA.produto}</a>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: "16px 0 4px" }}>{title}</h1>
        <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 32 }}>Última atualização: {EMPRESA.atualizado}</p>
        {children}
        <hr style={{ margin: "40px 0 16px", border: 0, borderTop: "1px solid #E5E7EB" }} />
        <p style={{ fontSize: 13, color: "#6B7280" }}>
          {EMPRESA.razao} · CNPJ {EMPRESA.cnpj} · {EMPRESA.endereco} · <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
          <br /><a href="/privacidade">Política de Privacidade</a> · <a href="/termos">Termos de Uso</a>
        </p>
      </div>
    </div>
  );
}

const H = ({ children }: { children: ReactNode }) => <h2 style={{ fontSize: 20, fontWeight: 700, margin: "32px 0 8px" }}>{children}</h2>;
const P = ({ children }: { children: ReactNode }) => <p style={{ margin: "0 0 12px" }}>{children}</p>;
const UL = ({ children }: { children: ReactNode }) => <ul style={{ margin: "0 0 12px", paddingLeft: 22, listStyle: "disc" }}>{children}</ul>;

export function PrivacyPolicy() {
  return (
    <Layout title="Política de Privacidade">
      <P>
        Esta política explica como a <b>{EMPRESA.razao}</b> (“{EMPRESA.fantasia}”, CNPJ {EMPRESA.cnpj}) trata dados pessoais no <b>{EMPRESA.produto}</b>,
        sistema de gestão e CRM para revendas de veículos disponível em {EMPRESA.site}, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
      </P>

      <H>1. Quem é responsável pelos dados</H>
      <P>
        As revendas que contratam o {EMPRESA.produto} decidem quais dados dos seus clientes cadastram e para quê. Em relação a esses dados,
        a revenda é a <b>controladora</b> e a {EMPRESA.fantasia} é a <b>operadora</b>: tratamos os dados apenas para prestar o serviço e conforme as instruções da revenda.
        Em relação aos dados das próprias revendas e dos seus usuários (nome, e-mail, login), a {EMPRESA.fantasia} é a controladora.
      </P>

      <H>2. Quais dados tratamos</H>
      <UL>
        <li><b>Usuários do sistema:</b> nome, e-mail, telefone, função na loja e registros de acesso.</li>
        <li><b>Clientes das revendas:</b> nome, telefone, e-mail, CPF/CNPJ, endereço e dados de veículos, vendas, financiamentos, promissórias e documentos cadastrados pela revenda.</li>
        <li><b>Mensagens do WhatsApp:</b> quando a revenda conecta o WhatsApp Business pela API oficial da Meta, recebemos o número, o nome de perfil e o conteúdo das mensagens trocadas com o número da loja, para exibi-las no CRM e permitir a resposta pelo sistema.</li>
        <li><b>Dados técnicos:</b> endereço IP, navegador e registros de uso, para segurança e correção de erros.</li>
      </UL>

      <H>3. Para que usamos</H>
      <UL>
        <li>Prestar o serviço: estoque, vendas, financeiro, CRM, atendimento e emissão de documentos.</li>
        <li>Receber e enviar mensagens do WhatsApp em nome da revenda, sempre a partir de uma ação dela ou de uma mensagem enviada pelo cliente.</li>
        <li>Segurança da conta, prevenção a fraudes e suporte técnico.</li>
        <li>Cumprir obrigações legais e fiscais.</li>
      </UL>
      <P>Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</P>

      <H>4. Com quem compartilhamos</H>
      <P>Apenas com fornecedores necessários para o funcionamento do serviço, e só quando a revenda usa o recurso correspondente:</P>
      <UL>
        <li><b>Meta Platforms</b> (WhatsApp Business Platform), para enviar e receber mensagens;</li>
        <li><b>Focus NFe</b>, para emissão de notas fiscais;</li>
        <li><b>Autentique</b>, para assinatura eletrônica de documentos;</li>
        <li><b>Resend</b>, para envio de e-mails do sistema (como recuperação de senha);</li>
        <li><b>OpenAI e Anthropic</b>, para o assistente de inteligência artificial, quando ativado;</li>
        <li>serviços de consulta de placa de veículos e o provedor de hospedagem dos servidores.</li>
      </UL>
      <P>Também podemos compartilhar dados quando exigido por lei ou por ordem de autoridade competente.</P>

      <H>5. Dados da Meta e do WhatsApp</H>
      <P>
        Os dados obtidos pelas APIs da Meta (como mensagens, números e identificadores das contas do WhatsApp Business) são usados somente para exibir as conversas da revenda no
        {` ${EMPRESA.produto}`} e enviar as respostas que ela escrever. Não usamos esses dados para outros fins, não os vendemos e não os transferimos a terceiros, exceto quando necessário para prestar esse serviço.
        Os tokens de acesso fornecidos pela Meta são guardados criptografados.
      </P>

      <H>6. Por quanto tempo guardamos</H>
      <P>
        Enquanto a revenda mantiver a conta ativa. Após o cancelamento, os dados são excluídos em até 90 dias, salvo os que precisamos guardar por obrigação legal ou fiscal.
        Ao desconectar o WhatsApp, deixamos de receber novas mensagens imediatamente; as mensagens já recebidas continuam no CRM da revenda até que ela as exclua ou cancele a conta.
      </P>

      <H>7. Segurança</H>
      <P>
        Usamos conexão criptografada (HTTPS), senhas protegidas por hash, tokens de integração criptografados, controle de acesso por função (dono, administrador e vendedor)
        e separação dos dados de cada revenda.
      </P>

      <H>8. Seus direitos e exclusão de dados</H>
      <P>
        Pela LGPD, você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade ou exclusão dos seus dados, e revogar o consentimento.
        Se você é cliente de uma revenda, o pedido deve ser feito preferencialmente à própria revenda, que é a controladora dos dados; nós a ajudaremos a atender.
      </P>
      <P>
        <b>Para pedir a exclusão dos seus dados</b>, inclusive os recebidos pelo WhatsApp ou pelo login do Facebook, envie um e-mail para{" "}
        <a href={`mailto:${EMPRESA.email}?subject=Exclusão de dados`}>{EMPRESA.email}</a> com o assunto “Exclusão de dados”, informando seu nome e o telefone ou e-mail usado.
        Respondemos em até 15 dias.
      </P>

      <H>9. Cookies</H>
      <P>Usamos apenas cookies e armazenamento local necessários para manter você conectado e lembrar preferências da tela. Não usamos cookies de publicidade.</P>

      <H>10. Alterações e contato</H>
      <P>
        Podemos atualizar esta política; a data no topo mostra a última versão. Dúvidas: <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> ·
        {` ${EMPRESA.razao}, ${EMPRESA.endereco}.`}
      </P>
    </Layout>
  );
}

export function TermsOfUse() {
  return (
    <Layout title="Termos de Uso">
      <P>
        Estes termos regem o uso do <b>{EMPRESA.produto}</b>, sistema oferecido pela <b>{EMPRESA.razao}</b> (CNPJ {EMPRESA.cnpj}).
        Ao criar uma conta ou usar o sistema, a revenda e seus usuários concordam com estes termos e com a <a href="/privacidade">Política de Privacidade</a>.
      </P>

      <H>1. O serviço</H>
      <P>
        O {EMPRESA.produto} é um software online para revendas de veículos, com estoque, vendas, financeiro, CRM, atendimento, vitrine on-line e integrações opcionais
        (WhatsApp, nota fiscal, assinatura eletrônica, consulta de placa e assistente de IA). Os recursos disponíveis dependem do plano contratado.
      </P>

      <H>2. Conta e acesso</H>
      <UL>
        <li>A revenda é responsável pelos usuários que cadastra e pelo que eles fazem no sistema.</li>
        <li>Cada usuário deve manter sua senha em sigilo e avisar imediatamente em caso de uso indevido.</li>
      </UL>

      <H>3. Uso permitido</H>
      <UL>
        <li>A revenda deve ter base legal para os dados de clientes que cadastra e para as mensagens que envia.</li>
        <li>É proibido usar o sistema para spam, fraude, conteúdo ilegal ou para violar direitos de terceiros.</li>
        <li>No WhatsApp, a revenda deve seguir as políticas da Meta e do WhatsApp Business, incluindo as regras de mensagens e de modelos aprovados.</li>
      </UL>

      <H>4. Integrações de terceiros</H>
      <P>
        Integrações como WhatsApp (Meta), nota fiscal e assinatura eletrônica dependem desses fornecedores e das contas da própria revenda.
        Custos cobrados por eles, como as mensagens do WhatsApp cobradas pela Meta, são pagos pela revenda diretamente ao fornecedor.
        Não respondemos por indisponibilidades ou mudanças feitas por esses serviços.
      </P>

      <H>5. Pagamento e cancelamento</H>
      <P>
        Os valores e a forma de pagamento são os do plano contratado. A revenda pode cancelar a qualquer momento; o acesso segue até o fim do período já pago.
        Após o cancelamento, os dados são excluídos conforme a Política de Privacidade.
      </P>

      <H>6. Disponibilidade e responsabilidade</H>
      <P>
        Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para manutenção ou por falhas fora do nosso controle.
        As informações registradas, os documentos emitidos e as decisões comerciais são de responsabilidade da revenda.
      </P>

      <H>7. Propriedade intelectual</H>
      <P>O software, a marca {EMPRESA.produto} e seus conteúdos pertencem à {EMPRESA.fantasia}. Os dados cadastrados pela revenda continuam sendo dela.</P>

      <H>8. Alterações e foro</H>
      <P>
        Podemos atualizar estes termos e avisaremos as revendas sobre mudanças relevantes. Fica eleito o foro da comarca de Fortaleza/CE.
        Contato: <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>.
      </P>
    </Layout>
  );
}
