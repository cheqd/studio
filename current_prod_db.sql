--
-- PostgreSQL database dump
--

-- Dumped from database version 15.4
-- Dumped by pg_dump version 15.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: claim; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.claim (
    hash character varying NOT NULL,
    "issuanceDate" timestamp without time zone NOT NULL,
    "expirationDate" timestamp without time zone,
    context text NOT NULL,
    "credentialType" text NOT NULL,
    value text NOT NULL,
    type character varying NOT NULL,
    "isObj" boolean NOT NULL,
    "issuerDid" character varying,
    "subjectDid" character varying,
    "credentialHash" character varying NOT NULL
);


ALTER TABLE public.claim OWNER TO veramo;

--
-- Name: credential; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.credential (
    hash character varying NOT NULL,
    raw text NOT NULL,
    id character varying,
    "issuanceDate" timestamp without time zone NOT NULL,
    "expirationDate" timestamp without time zone,
    context text NOT NULL,
    type text NOT NULL,
    "issuerDid" character varying NOT NULL,
    "subjectDid" character varying
);


ALTER TABLE public.credential OWNER TO veramo;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.customers (
    "customerId" character varying NOT NULL,
    account text NOT NULL,
    address text NOT NULL,
    kids text[] DEFAULT '{}'::text[] NOT NULL,
    dids text[] DEFAULT '{}'::text[] NOT NULL,
    "claimIds" text[] DEFAULT '{}'::text[] NOT NULL,
    "presentationIds" text[] DEFAULT '{}'::text[] NOT NULL
);


ALTER TABLE public.customers OWNER TO veramo;

--
-- Name: identifier; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.identifier (
    did character varying NOT NULL,
    provider character varying,
    alias character varying,
    "saveDate" timestamp without time zone NOT NULL,
    "updateDate" timestamp without time zone NOT NULL,
    "controllerKeyId" character varying
);


ALTER TABLE public.identifier OWNER TO veramo;

--
-- Name: key; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.key (
    kid character varying NOT NULL,
    kms character varying NOT NULL,
    type character varying NOT NULL,
    "publicKeyHex" character varying NOT NULL,
    meta text,
    "identifierDid" character varying
);


ALTER TABLE public.key OWNER TO veramo;

--
-- Name: message; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.message (
    id character varying NOT NULL,
    "saveDate" timestamp without time zone NOT NULL,
    "updateDate" timestamp without time zone NOT NULL,
    "createdAt" timestamp without time zone,
    "expiresAt" timestamp without time zone,
    "threadId" character varying,
    type character varying,
    raw character varying,
    data text,
    "replyTo" text,
    "replyUrl" character varying,
    "metaData" text,
    "fromDid" character varying,
    "toDid" character varying
);


ALTER TABLE public.message OWNER TO veramo;

--
-- Name: message_credentials_credential; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.message_credentials_credential (
    "messageId" character varying NOT NULL,
    "credentialHash" character varying NOT NULL
);


ALTER TABLE public.message_credentials_credential OWNER TO veramo;

--
-- Name: message_presentations_presentation; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.message_presentations_presentation (
    "messageId" character varying NOT NULL,
    "presentationHash" character varying NOT NULL
);


ALTER TABLE public.message_presentations_presentation OWNER TO veramo;

--
-- Name: migrations; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.migrations OWNER TO veramo;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: veramo
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.migrations_id_seq OWNER TO veramo;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: veramo
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: presentation; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.presentation (
    hash character varying NOT NULL,
    raw text NOT NULL,
    id character varying,
    "issuanceDate" timestamp without time zone,
    "expirationDate" timestamp without time zone,
    context text NOT NULL,
    type text NOT NULL,
    "holderDid" character varying
);


ALTER TABLE public.presentation OWNER TO veramo;

--
-- Name: presentation_credentials_credential; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.presentation_credentials_credential (
    "presentationHash" character varying NOT NULL,
    "credentialHash" character varying NOT NULL
);


ALTER TABLE public.presentation_credentials_credential OWNER TO veramo;

--
-- Name: presentation_verifier_identifier; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.presentation_verifier_identifier (
    "presentationHash" character varying NOT NULL,
    "identifierDid" character varying NOT NULL
);


ALTER TABLE public.presentation_verifier_identifier OWNER TO veramo;

--
-- Name: private-key; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public."private-key" (
    alias character varying NOT NULL,
    type character varying NOT NULL,
    "privateKeyHex" character varying NOT NULL
);


ALTER TABLE public."private-key" OWNER TO veramo;

--
-- Name: service; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.service (
    id character varying NOT NULL,
    type character varying NOT NULL,
    "serviceEndpoint" character varying NOT NULL,
    description character varying,
    "identifierDid" character varying
);


ALTER TABLE public.service OWNER TO veramo;

--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Data for Name: claim; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: credential; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('3q5x9d11l5h7', '04925bdbb504118b58acd5708daa429017757a38547139d25c71c38dcce80fa765c60899c1e55a9ead8e713479c4b4d66fbf2e64623f4048dc912513c052628287', 'cheqd1g2z8qkq7yq9a947j2ysksyhkyp754827c8ch4s', '{0a81e8db319138a0b05492613fdd59aba5e485d9d4e5f2c8e20a4b88b2ff4be4,595c856060cad66616a9b400ad4da889c8b8281d10ed453ec6e6e29e31100b72,2d8d59793817774981ed79eb3d2a891967d112afc5d4e19bde52fdeb8b8be680,8660beb65fc803d0bdec1272d84abc9f226b79656e946f9f72501720803991e8,be44d08c81c64519279aa9c201efa5cf58f47cb04d1455fa780946a8d7e09bab,53bdfb9bd9618672e572bd06917bf786f42a35d31986f2e04529be4fd1e69f3a,c1243cd7d87a03adefad18e09914c7cfcaf3ce84132d9c07570f9d5b71aba771}', '{did:cheqd:testnet:30aa83a3-d541-4381-b1e3-e080b51ef8fb,did:cheqd:testnet:cef7c4b5-d864-4b4a-a6ca-a932ff37b987,did:cheqd:testnet:874715d1-1e41-45bd-a45c-6dfb685fc08b,did:cheqd:testnet:514ec4a5-463c-4fc2-91b1-99bff82aeae5,did:cheqd:testnet:7nqSJBYpGpwicy7zww9PSH,did:cheqd:testnet:1b9ba7a0-9541-4f7c-ab14-9c3637e6a170}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('b9f0217e-3bd4-4485-97d5-0cd8033442d1', '049c6cee06184b60ee556dc6dd3b306e3f041e8c8940e6b18aa26e8b5283fa2061e964da93df91891d666aa9339014fc7561e8b5a5b963adbea183e308db7be8a8', 'cheqd1xddzwh8mlckldlfdytfacwru6004zvvr2dnlka', '{e5510ed495584e734c2fc3d4fbfe5a7a704dea0c0d709c1c7ebdac789749fe0f,90fa84f1532bc7c98ddf9499661a5876653a6afebb4f67dc039e16efaa7b6c3e,1afb99a50476e209dbb6d03934116528183b8a4cc34c2cdfe6df8448d3e4807a,471a2c07044371547719253a5899225eabb932ff628b5898dbc85b2418e3e22b,4f31272af3a596ba80729e1eafbb5045d4c6a3b970ee7373b8347a516ad4d938,9b5202352b422ffc8df21301a0f40bf74239fc2ffbf25b45feae9118100038c5,1fd4a3c320150bf8b6d1bf3d1b7a458bcc2bef26220e34c49a72bbeafb1e6685,8ef4dc3db33c9557cb9e44d9fdd0af6f9c16eb896fc25c3f63932ee50a95032b,f75c2c97b11e02ae3fca9ecd6b35a8ccb260cbbdc1c05b02b08ce67b7216ac46,2cad7b50dda250d19c7ec40639b23d47747029be1be7cb21bebea5e41c8761cf,16e3949958c9862ef9711f88aaafd0e79e65899dd308b55e3d3b3deaacfa6f55,a7fa224bb1c23da44dcd92ea303d34020348fc960cca9b645477464e0a1b4459,2b07a9fd44e3c1204112eddc002ad5e5488775f54e904cbee973c9575a5a4d08,a5468ecd54c0e2ef5d35ba6959f448da3e74a16ceaf58be39459b5ddbe523f0a,de15199b8484e5550a93135b86cbb783ddba90a64bbb033da3c6b885c69b27f0,b64139459fc8c5efe5c535af5ef0578223abf29eae1723e1d9a33ef1706c2765,1a4563a5958b928514c60215545f587bce7a0b7f43550d8bb0cc784db20679e4}', '{did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0,did:cheqd:testnet:c5384b25-8448-4cc1-a9e4-e181947dfdb3,did:cheqd:testnet:1d2c7ba9-897b-47b3-8760-3c569581f706,did:cheqd:testnet:c11b9a4f-adc6-4410-bd86-b0d9ff5046f3,did:cheqd:testnet:38e226fb-7a46-470e-ad2f-539046a3db0b,did:cheqd:testnet:e9966076-96b3-4409-9d4b-4d4125910a61,did:cheqd:testnet:b4ae5ba7-633b-4957-b75d-1420fee65a0f,did:cheqd:testnet:76845110-6150-4152-9a45-b553130fdce1,did:cheqd:testnet:72fad8ee-4174-44a1-b817-9312e6ae1345,did:cheqd:testnet:76b8a444-4d49-4c33-88e5-459e365589b4,did:cheqd:testnet:cedfc327-0a06-4293-b3d5-01edcd0e72e2}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('276h9tfa31fd', '0477c0969475b4e2dff1f565418096d2436bfff23868a914da4177a9c11537cc70e7f9c70966164d97c5e41caeb834b2e6887ebb418d8911b3eaadecef35c8a5fb', 'cheqd1qf53yrnfgd7q7n484u0swh8dtde55xh27y0lum', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('28o829edenga', '042c966a9abc89b5fa81594ca8722abf19148574ee084b058e2c0fd45f7b220e030537cabb9e5892fc4af0dcd3c1fd916bf528a9e75ae9123a817b2ef97d7edc66', 'cheqd138th8v9gk0jv3jhku2gcz2vhv3av06ykcprazn', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('vktgcqevavtx', '0431166a2525205490eabcd05c9bb7b687b44d229e8e40dc477b07bc92f58c188d6347711081ab85b54c7dfcf23826a4e3edb1ac04a43925b1a6f21c74e0be89f1', 'cheqd1m8jjkn2s9art237wa48cwxcj4pmy05g0naml6f', '{865be07a3f4f49fa289d8854aeeaadab5826f0bc012c1111d53aae24dfb6ec60}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('5yeods8vomdv', '04dcd36642bdc212e69c13e86d5d62d71ce74d60f6933f0b9c6cefb98618f9c453a25282b0257c8a4eb545b8b62ebd0e150938943c289b14e4ac286192b6e602d2', 'cheqd1pefkjtrxxp9ppejafg87ucfa5fy8qc3uhc03nn', '{2c3898a7eab728b0e01c1f6bca5b31876a62dea45920ec8733822331c9b55972,62818f4484407b2b836d07f7c8d3c4e3fb6a30a3a4fdeaddbe46e78a77e53539}', '{did:cheqd:testnet:139119e8-35d3-41df-940d-6e2037504e27}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('p1qmc0ovuau1', '0440a3edec558cc77371595489c52c7bbf06bec937862042466051653443cd7efac0daa9a2992cb5b03e33f7752413a66bf6f34c0e29fd3a716b135c7aaf3193d9', 'cheqd14al4ruuzd9acvf04qyr6zjnsvsqrphkyk9d3wj', '{0ed0ccc4ee2e153c713b46b035616c4c1c008090fea879de360a6ce31f430083,164c913122f897e1af1b56d70d5d55b44f4d8c89bf1e28b476370cbebec84f6c}', '{did:cheqd:testnet:c91857d5-1245-4f6d-ab81-390282370436,did:cheqd:testnet:d2e0a3d0-f5f9-4699-a640-fe437494fad6}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('c2kqw0p5qho7', '049beed137ad630dd6bd525db9f51be1d28f08dc61e97cb3338e5ecc2e827d3eeb974384a64ed84c2292cae0b1afde0fb12b6464d9954523a823be29f57c081f81', 'cheqd1c72yfspkesll750vh247rujpvd0w7gsgeqgw9f', '{5a3d9600fd9e604252433c8c908d2d4bf208c44d394b4cc049459065c7e77c9f}', '{did:cheqd:testnet:8687b62f-ba3e-45fc-8707-53f4857f752e}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('cwyd0ht813y6', '044e67482faf51383347b8570a2d2f096c97328393a1969bcbbc8dae6d8dc9cd0437273fa5981f0162adbb54f4bed4d1567ed8a3408dc74046fcd5ef4975ff59f5', 'cheqd167782dwp75pgw22xz8cdh64k632dfwya84rgmu', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('t91z9hqll1vk', '049c40ad9e7e4cae9feb7f33d881b58961fed0bd3eff54db1ebf7f7fb69e3fecf54359bc518569dc178cbb0734a9538cccf90f021b8c2c609933b2f1417d114ab8', 'cheqd1agnrlr4duk8qq2k3zhm497jg4tkfhkchhqz3v9', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('jj3oq9uzce97', '04d3fc51ea10db478f87369428e99d8ed18d748a57b940e0c8a173369e21e1b4699cfe70202f0e767298b76ab7840d0a6169da15cfae3d39475b27eb081f168e49', 'cheqd1c69gqzyzhrr8sru5ygpldwxp6jnn77u60hkjnh', '{127d9fbdf68ad0dd6343c7e3fff64a60559f77b4d2b2ac38674d44f26697816d}', '{did:cheqd:testnet:33e08531-306d-4304-a8cf-147ccbf2e047}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('htfpt92f60qp', '04757c68343137e4216e4268626edba7a5da613297bdf1ff95e43eb9aec027d619b3f8975b5d8aa681096603f2c30198cf5e5edb70b3fed11ee39110b7e434e53d', 'cheqd1gxc06xkt89cdw2sqj7qw8akdfkzqag3tfm9asq', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('4stubeoyfl4u', '0468d90b345429cb78425ca4d8abef8ee6b9aaed583265c7c5a8d1c9e1a7fad366fa753287dfdffab46dc8b202d1c3233204d263392bb40a2089e6e54b24a301a2', 'cheqd1sp498xmynwswxzxm0g4etx4ft5y2y8p0ja7lyg', '{f9321a494b98982a50cde7e750eabd9791b37c99384f122d359c68e898ffbded,890b975720d6b61c7731de117341b14bded7ff918ba0c45fc93d4a8ceb8a4956,b6e888bbd41053c9df95e3d534d60e52bd097ec8c089076a4fd66c13925dcd81}', '{did:cheqd:testnet:d8cfcf08-c3ea-4a2e-aad2-4169078ec523,did:cheqd:testnet:33cb7b21-3c9d-422c-be01-7072f66da067,did:cheqd:testnet:85197ae7-a2b6-4b3e-b99f-63408056d1cc}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('ohkxe1ccok4d', '04a38c02368ae890ce16bd035f821baf0589f7e9605c6c0f01b025d2ecd0e8ea0c1addb1dbb326c3bf17ef751414e2f9660e22fe9133e935a564e733938a21c584', 'cheqd1jl2nkrufvd6yp50g5843rh9q3pkga8rcht96ef', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('wog0z70kg1s4', '0498ad0a233249b4c432e61e29cd635a20a96f894a5aae57a1f0a0a4c06153aae61e4ed7717216c98826a221023aa56f7b019eeb520aa2f50767c214d0d7a47be7', 'cheqd13qre5ufyvp3mpdlx5s7krjjcnxdra4d77erpw7', '{df9229453c8d3a6bee43cf0b73148d5d2d2bd410f88951fb99c3458fa095ee6b}', '{did:cheqd:testnet:5be5713a-bd28-4d6f-b23a-377378c21a18}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('h9g3p99olp68', '04aba4b7e19c69b2c24b6543b3c7025b30c82a3152de229a0ff159a0a854d9962a224144713cb5ad44e2c4fd78f1f4debab0e8d5d2f5bf933438572ca667d5b827', 'cheqd1cmh8m7sqx7wucz2axvagevg5rhzhhktyx5jxxs', '{b26cbed7a31d36b8fc79a1473d05d267ad06aa2dd4a393187707cc77bed1062a,20a651a85b41986019049e1719a907783bfdcb18e4f3acfaa59a4affc01f69b4,44b7187bf2b81e6704c42c1e9e3496ca687139c77d2fcfa4e5a707eef126155a,c034e0bff7146159ebdaaa7875c66c57c180ae02d70f9a61bb8ab221ea779d2d,3fba6d88f96a6452d932a19c423f2d0d86a43a548dd3693c1d9156d203fa8610,4c96674e36df5a7655df416e956448629c112f15965832e9094e284ff6efc6e0,90731085833bc837ea1dce9f1fd4cd2bd237c5dc2560df97cf24898d1833a2be,0db8c5764686ba96f667afd2d7b28f1fc29e611af56511072673cedf89634090,5480fcafe42916cc6ce7464b676a66d1803de4ac702b5733e2c93e1d892e3a6d,4a34dfd7a4921dc133c56471a5c3d8d32b1ed94f9fe3af08b168f9478dd4bd50,99bb591c96e45356d72ea0a04a11e1cc03c62b984b8adee645ffe61adf932ef5}', '{did:cheqd:testnet:0cc0a3bb-b7e9-4888-b41c-c0a018fa5e5b,did:cheqd:testnet:0e990794-9280-4be2-8629-0da95423ffc0,did:cheqd:testnet:aa40ab64-a2a2-47e9-89be-08686862e576,did:cheqd:testnet:9a8cab32-4006-4dd2-9b7d-2a6a3ddd92e7,did:cheqd:testnet:4ddce472-8c26-421a-ad1b-e0e6b79ae27e,did:cheqd:testnet:63bcd614-7137-4fa2-a3a7-c831544e67e8}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('64ppnw1wgpx8', '048ea1ebb81e422338644cc0bcd49b0e1d41ff548dc3feb37b49fec98cce9e67182c7b5018944b15cb1f630fe4090759a403a01b4bcf1dd0e475d0feccd998bc6d', 'cheqd1gny39hyqlx9rc3zm0yckgesve93qxf60urmu4l', '{3d743e2960430c15cd96a423dd71bcb6c7a95a2ca4c35faa4e8655b9c62807ed,54bda69d8f011c350c22bb44247c0fc4f16798db1139ccdf4f30e4ff10e3bb7d,d149cfbfba19ac1eb0ee7e4885596a0c11000020839c67f1d181a2fcdf252d34,9a6c1bddde79a50e9861a009b0cf02d146df43b3f9cf622ad4a2f473dd012d7d,b9e75dad0e18858744cb9a4f132065444ea81040d41e281009b1ef161f825ded,b83edc876a031a37dbf36f35e8dee05c4b18e2b305f51dabb21869647ea6cf00,519774ec7eb7eb149799b8ee66a4f90bc7de7ce0fb05b45f432494b55d1ec3d2,dd57367110b44cb79700c06daa54eec92f254344d3845606d934717371740c1e,f38bdd03c3aa34f1f4390fdaff2badd40bebcc2f77a3337f663e991ab39e7396}', '{did:cheqd:testnet:240c9b1f-9eb5-4bf9-a9ce-bb9fd99bb073,did:cheqd:testnet:fdc20a18-4085-4cf6-9735-e9558f1258be,did:cheqd:testnet:699159ff-fd86-43d1-a375-7dcee9fa6021}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('emk2sbw5q6zf', '04ddbdf1d89c8a02b4d1661d01e337656a9de93b2c3021981f568b754965008cde305126782bd40c15abf1d77226b0500a4ad757c923752e5996c41490a38b3660', 'cheqd1n0mks0aktp93wn5etprxe0jj9w2dqqtdr70w6y', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('tcv3l1921y6y', '04f873625c463d98d8b572d4fd2e78a5b1d422e129e7b9d8e23b56c7521f8b1c88de30ad65df3cc7d54d5f6ba138d7320c9266e1ea5f3403cd4c2b85d044b79aa0', 'cheqd135w483g7kq855906zsp7df0lfdyhuxuyjq7qdm', '{3d8bfbceb0ab85f880b7ac597ac2d74cc37dbebf2a4b9b61e7bcd4152553ce39}', '{did:cheqd:testnet:6965ccce-c380-4d92-9af6-b661054fc475}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('9ed9lvew4u9e', '046025baf96995e2395882052069a7e5fe369b27d1abe2c94e6b3a2ff9e02abf45793bae6cba419d41a2d875ab9bc161a8afd98a9420dc49aff49f49464c41cfd8', 'cheqd1c2gzvdez2u3r4wutwdksem7c6nxrg6mlzq4slv', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('ueuiitvv1l29', '047901bb6ef2562d58a55f8834d0314d1525997d25e85de2aed4319abf9e26f5cf03f5e8589870ff783addbde0549af632eb1d3cae51750de30e4dda3bd0c6b0e7', 'cheqd1ae6s90jg8asas6tdemvfqdhhldcxr8jsyus96c', '{154ef9d918a2de9982599df007981627827194b32b1f8274ced38ad8b37b81fc,7ac2eb65f465d921ed9fa74bd2fb3acdf3bb75a17d0c3466873a075204efd723,e315972e9d783d319bcc05823c80d5bea7dd2d70953eeab93bda2be23c615281,c022b16fea0c2f975c14968650a0b9f54979e270cbdcf9d200c5c1a1c7a4af18,4feb458d4bfaddf2472b69a546dbb38bf98d806e429a8ca9aafe51a8a4b9ef00,5bdf6cecc2b781ed8fffa1e65f424a49f9cb4bff419ce27a72dc1ef3b9ccb4e0,6535953482fef27c0569ddf3b11adae500538c3c9b91f04ce23428f0f60a254b,a5ed01da0191866ab3a967fb2721d40fd20ceb64b5f878febf4a40b1ee2e7f81,0efd899838a95188472cea8dcb735651faf84d2bd59ba9d1038f274ecace4318}', '{did:cheqd:testnet:e7bc1aac-cc50-4eeb-b2c1-16c577d7c94e,did:cheqd:testnet:db40ca38-4448-42d6-9fde-b59239ad0fef,did:cheqd:testnet:8b91d173-992a-4046-86af-1f533224d412,did:cheqd:mainnet:7dd80b01-070f-4f1d-a227-9d4c12f9e559,did:cheqd:testnet:2e8daf5b-5ec2-4f35-8d24-ac27af44a230,did:cheqd:testnet:46d54210-2a94-4c0d-ad15-ca085bf8b71e,did:cheqd:testnet:591d7791-5c13-4e33-9488-03576f20ff7b,did:cheqd:testnet:6b4c1604-451b-4af9-b193-66eb09e60d6b,did:cheqd:testnet:32131a75-fa96-4ff8-b782-d1e70982e384}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('mvsp774lf5ia', '041bf6b6912512f13d574709c0b1ac6efb6de5d91bda4363ea1a60da4002be7f31ff2229f5f66a8e52c17e4a3e9a4b14caea7a40c816e3c6e4452b7853ec4154cd', 'cheqd1g97zdf0pwcl3y0wms8gc8gpxfa3p8h395yad4g', '{}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('4099x5s0jsxi', '04c519047b10d49f38a2113066087e95221b59659f6e91d5ea9be91ec58d80aefffb9682deb4bf0b005a0bd0953ca3013f3dedd8e7f73ab2a7e21733bcb68aa766', 'cheqd1qe4w3v8nham6m9lpv508twxq9uw8lsue00p7tl', '{053962683659f39d83f590226c80bec4a4c29ddbf8464321518223847067b93f}', '{did:cheqd:testnet:a8c06af9-38a1-4239-acb9-510cf61dc7ce}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('dv40mpldkno7', '04f881d5ae2c3dfcff999971b3cc161a24cd5a6caebcddab43410a54902ff08a839f2343c4cee351fea15bc09e8e2f9e78752fe7beb759b139daa5111b53b30942', 'cheqd1tqseah9t547yhewm5pjfswhyalceqt50xvzs9u', '{e398b1a73eafcc9d1536a3b28e2d5be017007c515468b8fe28ade3698d878685,c07e6ad9070a267a2f8368f0f059b13d2a69f6e8384e2171a5dba0985fb038f2,e316d12b6462925985008be1cbf534a5912100345fad8ea4b07bbcae46edef70,35d529f44a031ebb5b8add01380960b6f2dd285845c80ba8a5086a39aeb3157a,7f4f03875648766b35f44c2c004b8d1e8790dd86dddf5a97162880fe4cd2b101,94b2f517a5f7296b301d4936713f8e2a52bee54167f6bcfc836c9f76b52b44e5}', '{did:cheqd:testnet:242047a1-d115-4a29-a6cf-46d4c9a82027,did:cheqd:testnet:28727023-6a8d-4e64-902c-7ac617a4a0fc,did:cheqd:testnet:0dd6212c-6dc9-4374-96af-5461995694cb,did:cheqd:testnet:7d45e3fd-16e1-4ca2-8c2b-a6fe5efcc8ce}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('s32fc8xbopma', '046f8c9e30255d587147601809f1aa18909fc4f99f126060f26ad42e0575c0f0cb39704f4ebed134ffca5dad7c769862b82a02568f8ba8af8833b10be17231d24a', 'cheqd106qstdxdc9z0h6tvx3ml2deun4ysv2ncvmdju0', '{78cbfa7a0f952580bb9b4df8db9809025dfb6a8eef083c52fe918e520da3431e,f63c3aab6ee25033a8a48a268010c5fbafacdaa5c808ae17aadd0b5dc237b19f}', '{did:cheqd:testnet:3e69c28a-c293-444e-9686-b4c5da59638e}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('tt3vj3d53z0y', '042902fb45ec9b06f0972adc970fb320f845c06a5de5c841d5def7d28fc8241c0b3cf0086e2301a1f7a815902c3addfbf90afd21c07feb0965198b52e7338e178c', 'cheqd1gjuyjxrplfxxcp9mrtefj6mkphpvxp3tqugngd', '{79502c0f56ddf87e4b6a7978c34b0a6f8d1c44ee2ee8565d4ba85000e20bf2b6}', '{}', '{}', '{}');
INSERT INTO public.customers ("customerId", account, address, kids, dids, "claimIds", "presentationIds") VALUES ('v3msufv125re', '04c1fbcd77bb048539012cef4cb07f18149fdf783c7a58c40ae6d119c6ba8af8d6114a4d2b75eb74e5cb6aa806603f1cb0a7cff1870344746462ae9c891130dfd0', 'cheqd17ey0hgd48wyhyah5z6xfel24f40dnepc0r2f59', '{b04dd7eeb929db57c3aa707efc53a86c686a75e851aab855f05b977cd404b2cf}', '{did:cheqd:testnet:79ccd6f5-2953-461a-b2f1-b5b1617b3e72}', '{}', '{}');


--
-- Data for Name: identifier; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0', 'did:cheqd:testnet', NULL, '2023-06-07 15:54:09.111', '2023-06-07 15:54:09.111', '9b5202352b422ffc8df21301a0f40bf74239fc2ffbf25b45feae9118100038c5');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:c5384b25-8448-4cc1-a9e4-e181947dfdb3', 'did:cheqd:testnet', NULL, '2023-06-12 16:10:56.429', '2023-06-12 16:10:56.429', '8ef4dc3db33c9557cb9e44d9fdd0af6f9c16eb896fc25c3f63932ee50a95032b');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:1d2c7ba9-897b-47b3-8760-3c569581f706', 'did:cheqd:testnet', NULL, '2023-06-12 16:29:01.892', '2023-06-12 16:29:01.892', 'f75c2c97b11e02ae3fca9ecd6b35a8ccb260cbbdc1c05b02b08ce67b7216ac46');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:c11b9a4f-adc6-4410-bd86-b0d9ff5046f3', 'did:cheqd:testnet', NULL, '2023-06-13 09:13:17.9', '2023-06-13 09:13:17.9', '2cad7b50dda250d19c7ec40639b23d47747029be1be7cb21bebea5e41c8761cf');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:38e226fb-7a46-470e-ad2f-539046a3db0b', 'did:cheqd:testnet', NULL, '2023-06-13 09:47:23.7', '2023-06-13 09:47:23.7', '16e3949958c9862ef9711f88aaafd0e79e65899dd308b55e3d3b3deaacfa6f55');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:e9966076-96b3-4409-9d4b-4d4125910a61', 'did:cheqd:testnet', NULL, '2023-06-13 16:46:22.195', '2023-06-13 16:46:22.195', 'a7fa224bb1c23da44dcd92ea303d34020348fc960cca9b645477464e0a1b4459');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:b4ae5ba7-633b-4957-b75d-1420fee65a0f', 'did:cheqd:testnet', NULL, '2023-06-22 11:10:05.882', '2023-06-22 11:10:05.882', '2b07a9fd44e3c1204112eddc002ad5e5488775f54e904cbee973c9575a5a4d08');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:76845110-6150-4152-9a45-b553130fdce1', 'did:cheqd:testnet', NULL, '2023-06-22 11:11:28.157', '2023-06-22 11:11:28.157', 'a5468ecd54c0e2ef5d35ba6959f448da3e74a16ceaf58be39459b5ddbe523f0a');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:72fad8ee-4174-44a1-b817-9312e6ae1345', 'did:cheqd:testnet', NULL, '2023-06-22 11:22:19.474', '2023-06-22 11:22:19.474', 'de15199b8484e5550a93135b86cbb783ddba90a64bbb033da3c6b885c69b27f0');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:76b8a444-4d49-4c33-88e5-459e365589b4', 'did:cheqd:testnet', NULL, '2023-06-22 12:22:34', '2023-06-22 12:22:34', 'b64139459fc8c5efe5c535af5ef0578223abf29eae1723e1d9a33ef1706c2765');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:cedfc327-0a06-4293-b3d5-01edcd0e72e2', 'did:cheqd:testnet', NULL, '2023-06-22 16:54:19.323', '2023-06-22 16:54:19.323', '1a4563a5958b928514c60215545f587bce7a0b7f43550d8bb0cc784db20679e4');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:e7bc1aac-cc50-4eeb-b2c1-16c577d7c94e', 'did:cheqd:testnet', NULL, '2023-07-25 15:56:15.619', '2023-07-25 15:56:15.619', '154ef9d918a2de9982599df007981627827194b32b1f8274ced38ad8b37b81fc');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:db40ca38-4448-42d6-9fde-b59239ad0fef', 'did:cheqd:testnet', NULL, '2023-07-25 16:06:45.357', '2023-07-25 16:06:45.357', '7ac2eb65f465d921ed9fa74bd2fb3acdf3bb75a17d0c3466873a075204efd723');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:d8cfcf08-c3ea-4a2e-aad2-4169078ec523', 'did:cheqd:testnet', NULL, '2023-07-28 15:17:20.038', '2023-07-28 15:17:20.038', 'f9321a494b98982a50cde7e750eabd9791b37c99384f122d359c68e898ffbded');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:c91857d5-1245-4f6d-ab81-390282370436', 'did:cheqd:testnet', NULL, '2023-08-01 15:25:52.688', '2023-08-01 15:25:52.688', '0ed0ccc4ee2e153c713b46b035616c4c1c008090fea879de360a6ce31f430083');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:d2e0a3d0-f5f9-4699-a640-fe437494fad6', 'did:cheqd:testnet', NULL, '2023-08-01 16:07:12.41', '2023-08-01 16:07:12.41', '164c913122f897e1af1b56d70d5d55b44f4d8c89bf1e28b476370cbebec84f6c');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:8687b62f-ba3e-45fc-8707-53f4857f752e', 'did:cheqd:testnet', NULL, '2023-08-03 13:34:54.818', '2023-08-03 13:34:54.818', '5a3d9600fd9e604252433c8c908d2d4bf208c44d394b4cc049459065c7e77c9f');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:8b91d173-992a-4046-86af-1f533224d412', 'did:cheqd:testnet', NULL, '2023-08-15 13:40:47.371', '2023-08-15 13:40:47.371', 'e315972e9d783d319bcc05823c80d5bea7dd2d70953eeab93bda2be23c615281');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:139119e8-35d3-41df-940d-6e2037504e27', 'did:cheqd:testnet', NULL, '2023-08-16 11:36:44.626', '2023-08-16 11:36:44.626', '2c3898a7eab728b0e01c1f6bca5b31876a62dea45920ec8733822331c9b55972');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:33e08531-306d-4304-a8cf-147ccbf2e047', 'did:cheqd:testnet', NULL, '2023-08-21 04:53:05.212', '2023-08-21 04:53:05.212', '127d9fbdf68ad0dd6343c7e3fff64a60559f77b4d2b2ac38674d44f26697816d');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:mainnet:7dd80b01-070f-4f1d-a227-9d4c12f9e559', 'did:cheqd:mainnet', NULL, '2023-08-22 09:37:47.03', '2023-08-22 09:37:47.03', 'c022b16fea0c2f975c14968650a0b9f54979e270cbdcf9d200c5c1a1c7a4af18');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:2e8daf5b-5ec2-4f35-8d24-ac27af44a230', 'did:cheqd:testnet', NULL, '2023-08-30 06:33:17.384', '2023-08-30 06:33:17.384', '4feb458d4bfaddf2472b69a546dbb38bf98d806e429a8ca9aafe51a8a4b9ef00');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:30aa83a3-d541-4381-b1e3-e080b51ef8fb', 'did:cheqd:testnet', NULL, '2023-08-30 06:49:49.925', '2023-08-30 06:49:49.925', '0a81e8db319138a0b05492613fdd59aba5e485d9d4e5f2c8e20a4b88b2ff4be4');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:cef7c4b5-d864-4b4a-a6ca-a932ff37b987', 'did:cheqd:testnet', NULL, '2023-08-30 07:02:37.125', '2023-08-30 07:02:37.125', '595c856060cad66616a9b400ad4da889c8b8281d10ed453ec6e6e29e31100b72');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:874715d1-1e41-45bd-a45c-6dfb685fc08b', 'did:cheqd:testnet', NULL, '2023-08-30 07:03:28.966', '2023-08-30 07:03:28.966', '2d8d59793817774981ed79eb3d2a891967d112afc5d4e19bde52fdeb8b8be680');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:5be5713a-bd28-4d6f-b23a-377378c21a18', 'did:cheqd:testnet', NULL, '2023-08-31 09:30:53.03', '2023-08-31 09:30:53.03', 'df9229453c8d3a6bee43cf0b73148d5d2d2bd410f88951fb99c3458fa095ee6b');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:0cc0a3bb-b7e9-4888-b41c-c0a018fa5e5b', 'did:cheqd:testnet', NULL, '2023-09-02 12:42:45.491', '2023-09-02 12:42:45.491', '20a651a85b41986019049e1719a907783bfdcb18e4f3acfaa59a4affc01f69b4');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:0e990794-9280-4be2-8629-0da95423ffc0', 'did:cheqd:testnet', NULL, '2023-09-02 12:43:43.669', '2023-09-02 12:43:43.669', '44b7187bf2b81e6704c42c1e9e3496ca687139c77d2fcfa4e5a707eef126155a');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:aa40ab64-a2a2-47e9-89be-08686862e576', 'did:cheqd:testnet', NULL, '2023-09-02 12:44:06.664', '2023-09-02 12:44:06.664', 'c034e0bff7146159ebdaaa7875c66c57c180ae02d70f9a61bb8ab221ea779d2d');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:9a8cab32-4006-4dd2-9b7d-2a6a3ddd92e7', 'did:cheqd:testnet', NULL, '2023-09-02 12:49:23.881', '2023-09-02 12:49:23.881', '3fba6d88f96a6452d932a19c423f2d0d86a43a548dd3693c1d9156d203fa8610');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:4ddce472-8c26-421a-ad1b-e0e6b79ae27e', 'did:cheqd:testnet', NULL, '2023-09-02 13:03:25.769', '2023-09-02 13:03:25.769', '4c96674e36df5a7655df416e956448629c112f15965832e9094e284ff6efc6e0');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:63bcd614-7137-4fa2-a3a7-c831544e67e8', 'did:cheqd:testnet', NULL, '2023-09-02 20:08:27.447', '2023-09-02 20:08:27.447', '0db8c5764686ba96f667afd2d7b28f1fc29e611af56511072673cedf89634090');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:46d54210-2a94-4c0d-ad15-ca085bf8b71e', 'did:cheqd:testnet', NULL, '2023-09-04 23:23:26.743', '2023-09-04 23:23:26.743', '5bdf6cecc2b781ed8fffa1e65f424a49f9cb4bff419ce27a72dc1ef3b9ccb4e0');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:591d7791-5c13-4e33-9488-03576f20ff7b', 'did:cheqd:testnet', NULL, '2023-09-12 05:51:10.49', '2023-09-12 05:51:10.49', '6535953482fef27c0569ddf3b11adae500538c3c9b91f04ce23428f0f60a254b');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:6b4c1604-451b-4af9-b193-66eb09e60d6b', 'did:cheqd:testnet', NULL, '2023-09-15 01:34:32.572', '2023-09-15 01:34:32.572', 'a5ed01da0191866ab3a967fb2721d40fd20ceb64b5f878febf4a40b1ee2e7f81');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:32131a75-fa96-4ff8-b782-d1e70982e384', 'did:cheqd:testnet', NULL, '2023-09-18 21:33:01.054', '2023-09-18 21:33:01.055', '0efd899838a95188472cea8dcb735651faf84d2bd59ba9d1038f274ecace4318');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:6965ccce-c380-4d92-9af6-b661054fc475', 'did:cheqd:testnet', NULL, '2023-09-18 21:33:09.094', '2023-09-18 21:33:09.094', '3d8bfbceb0ab85f880b7ac597ac2d74cc37dbebf2a4b9b61e7bcd4152553ce39');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:a8c06af9-38a1-4239-acb9-510cf61dc7ce', 'did:cheqd:testnet', NULL, '2023-09-21 14:25:01.344', '2023-09-21 14:25:01.344', '053962683659f39d83f590226c80bec4a4c29ddbf8464321518223847067b93f');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:514ec4a5-463c-4fc2-91b1-99bff82aeae5', 'did:cheqd:testnet', NULL, '2023-09-26 12:04:51.983', '2023-09-26 12:04:51.983', 'be44d08c81c64519279aa9c201efa5cf58f47cb04d1455fa780946a8d7e09bab');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:7nqSJBYpGpwicy7zww9PSH', 'did:cheqd:testnet', NULL, '2023-09-26 12:26:10.81', '2023-09-26 12:26:10.81', '53bdfb9bd9618672e572bd06917bf786f42a35d31986f2e04529be4fd1e69f3a');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:1b9ba7a0-9541-4f7c-ab14-9c3637e6a170', 'did:cheqd:testnet', NULL, '2023-09-26 12:30:32.453', '2023-09-26 12:30:32.453', 'c1243cd7d87a03adefad18e09914c7cfcaf3ce84132d9c07570f9d5b71aba771');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:240c9b1f-9eb5-4bf9-a9ce-bb9fd99bb073', 'did:cheqd:testnet', NULL, '2023-09-26 12:34:46.421', '2023-09-26 12:34:46.421', 'b83edc876a031a37dbf36f35e8dee05c4b18e2b305f51dabb21869647ea6cf00');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:fdc20a18-4085-4cf6-9735-e9558f1258be', 'did:cheqd:testnet', NULL, '2023-09-26 12:50:46.438', '2023-09-26 12:50:46.438', 'dd57367110b44cb79700c06daa54eec92f254344d3845606d934717371740c1e');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:699159ff-fd86-43d1-a375-7dcee9fa6021', 'did:cheqd:testnet', NULL, '2023-09-26 13:03:36.456', '2023-09-26 13:03:36.456', 'f38bdd03c3aa34f1f4390fdaff2badd40bebcc2f77a3337f663e991ab39e7396');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:242047a1-d115-4a29-a6cf-46d4c9a82027', 'did:cheqd:testnet', NULL, '2023-10-11 23:13:33.882', '2023-10-11 23:13:33.882', 'c07e6ad9070a267a2f8368f0f059b13d2a69f6e8384e2171a5dba0985fb038f2');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:28727023-6a8d-4e64-902c-7ac617a4a0fc', 'did:cheqd:testnet', NULL, '2023-10-12 14:45:51.129', '2023-10-12 14:45:51.129', 'e316d12b6462925985008be1cbf534a5912100345fad8ea4b07bbcae46edef70');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:0dd6212c-6dc9-4374-96af-5461995694cb', 'did:cheqd:testnet', NULL, '2023-10-12 14:46:39.231', '2023-10-12 14:46:39.231', '35d529f44a031ebb5b8add01380960b6f2dd285845c80ba8a5086a39aeb3157a');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:7d45e3fd-16e1-4ca2-8c2b-a6fe5efcc8ce', 'did:cheqd:testnet', NULL, '2023-10-12 15:10:33.957', '2023-10-12 15:10:33.957', '94b2f517a5f7296b301d4936713f8e2a52bee54167f6bcfc836c9f76b52b44e5');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:33cb7b21-3c9d-422c-be01-7072f66da067', 'did:cheqd:testnet', NULL, '2023-10-24 12:34:40.629', '2023-10-24 12:34:40.629', '890b975720d6b61c7731de117341b14bded7ff918ba0c45fc93d4a8ceb8a4956');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:85197ae7-a2b6-4b3e-b99f-63408056d1cc', 'did:cheqd:testnet', NULL, '2023-10-24 12:35:20.999', '2023-10-24 12:35:20.999', 'b6e888bbd41053c9df95e3d534d60e52bd097ec8c089076a4fd66c13925dcd81');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:3e69c28a-c293-444e-9686-b4c5da59638e', 'did:cheqd:testnet', NULL, '2023-10-26 11:03:14.224', '2023-10-26 11:03:14.224', 'f63c3aab6ee25033a8a48a268010c5fbafacdaa5c808ae17aadd0b5dc237b19f');
INSERT INTO public.identifier (did, provider, alias, "saveDate", "updateDate", "controllerKeyId") VALUES ('did:cheqd:testnet:79ccd6f5-2953-461a-b2f1-b5b1617b3e72', 'did:cheqd:testnet', NULL, '2023-11-03 06:40:42.59', '2023-11-03 06:40:42.59', 'b04dd7eeb929db57c3aa707efc53a86c686a75e851aab855f05b977cd404b2cf');


--
-- Data for Name: key; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('164c913122f897e1af1b56d70d5d55b44f4d8c89bf1e28b476370cbebec84f6c', 'postgres', 'Ed25519', '164c913122f897e1af1b56d70d5d55b44f4d8c89bf1e28b476370cbebec84f6c', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:d2e0a3d0-f5f9-4699-a640-fe437494fad6');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('5a3d9600fd9e604252433c8c908d2d4bf208c44d394b4cc049459065c7e77c9f', 'postgres', 'Ed25519', '5a3d9600fd9e604252433c8c908d2d4bf208c44d394b4cc049459065c7e77c9f', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:8687b62f-ba3e-45fc-8707-53f4857f752e');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('e315972e9d783d319bcc05823c80d5bea7dd2d70953eeab93bda2be23c615281', 'postgres', 'Ed25519', 'e315972e9d783d319bcc05823c80d5bea7dd2d70953eeab93bda2be23c615281', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:8b91d173-992a-4046-86af-1f533224d412');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('a7fa224bb1c23da44dcd92ea303d34020348fc960cca9b645477464e0a1b4459', 'postgres', 'Ed25519', 'a7fa224bb1c23da44dcd92ea303d34020348fc960cca9b645477464e0a1b4459', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:e9966076-96b3-4409-9d4b-4d4125910a61');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('049c6cee06184b60ee556dc6dd3b306e3f041e8c8940e6b18aa26e8b5283fa2061e964da93df91891d666aa9339014fc7561e8b5a5b963adbea183e308db7be8a8', 'postgres', 'Secp256k1', '049c6cee06184b60ee556dc6dd3b306e3f041e8c8940e6b18aa26e8b5283fa2061e964da93df91891d666aa9339014fc7561e8b5a5b963adbea183e308db7be8a8', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('e5510ed495584e734c2fc3d4fbfe5a7a704dea0c0d709c1c7ebdac789749fe0f', 'postgres', 'Ed25519', 'e5510ed495584e734c2fc3d4fbfe5a7a704dea0c0d709c1c7ebdac789749fe0f', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('90fa84f1532bc7c98ddf9499661a5876653a6afebb4f67dc039e16efaa7b6c3e', 'postgres', 'Ed25519', '90fa84f1532bc7c98ddf9499661a5876653a6afebb4f67dc039e16efaa7b6c3e', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('1afb99a50476e209dbb6d03934116528183b8a4cc34c2cdfe6df8448d3e4807a', 'postgres', 'Ed25519', '1afb99a50476e209dbb6d03934116528183b8a4cc34c2cdfe6df8448d3e4807a', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('471a2c07044371547719253a5899225eabb932ff628b5898dbc85b2418e3e22b', 'postgres', 'Ed25519', '471a2c07044371547719253a5899225eabb932ff628b5898dbc85b2418e3e22b', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('4f31272af3a596ba80729e1eafbb5045d4c6a3b970ee7373b8347a516ad4d938', 'postgres', 'Ed25519', '4f31272af3a596ba80729e1eafbb5045d4c6a3b970ee7373b8347a516ad4d938', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('2e74a9a6a50408e584a418d6b3dcac8cf041236e6aede5e7e53d7ef4084a450b', 'postgres', 'Ed25519', '2e74a9a6a50408e584a418d6b3dcac8cf041236e6aede5e7e53d7ef4084a450b', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('c034e0bff7146159ebdaaa7875c66c57c180ae02d70f9a61bb8ab221ea779d2d', 'postgres', 'Ed25519', 'c034e0bff7146159ebdaaa7875c66c57c180ae02d70f9a61bb8ab221ea779d2d', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:aa40ab64-a2a2-47e9-89be-08686862e576');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('3fba6d88f96a6452d932a19c423f2d0d86a43a548dd3693c1d9156d203fa8610', 'postgres', 'Ed25519', '3fba6d88f96a6452d932a19c423f2d0d86a43a548dd3693c1d9156d203fa8610', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:9a8cab32-4006-4dd2-9b7d-2a6a3ddd92e7');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('4c96674e36df5a7655df416e956448629c112f15965832e9094e284ff6efc6e0', 'postgres', 'Ed25519', '4c96674e36df5a7655df416e956448629c112f15965832e9094e284ff6efc6e0', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:4ddce472-8c26-421a-ad1b-e0e6b79ae27e');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0db8c5764686ba96f667afd2d7b28f1fc29e611af56511072673cedf89634090', 'postgres', 'Ed25519', '0db8c5764686ba96f667afd2d7b28f1fc29e611af56511072673cedf89634090', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:63bcd614-7137-4fa2-a3a7-c831544e67e8');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('5480fcafe42916cc6ce7464b676a66d1803de4ac702b5733e2c93e1d892e3a6d', 'postgres', 'Ed25519', '5480fcafe42916cc6ce7464b676a66d1803de4ac702b5733e2c93e1d892e3a6d', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('4a34dfd7a4921dc133c56471a5c3d8d32b1ed94f9fe3af08b168f9478dd4bd50', 'postgres', 'Ed25519', '4a34dfd7a4921dc133c56471a5c3d8d32b1ed94f9fe3af08b168f9478dd4bd50', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('99bb591c96e45356d72ea0a04a11e1cc03c62b984b8adee645ffe61adf932ef5', 'postgres', 'Ed25519', '99bb591c96e45356d72ea0a04a11e1cc03c62b984b8adee645ffe61adf932ef5', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('5bdf6cecc2b781ed8fffa1e65f424a49f9cb4bff419ce27a72dc1ef3b9ccb4e0', 'postgres', 'Ed25519', '5bdf6cecc2b781ed8fffa1e65f424a49f9cb4bff419ce27a72dc1ef3b9ccb4e0', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:46d54210-2a94-4c0d-ad15-ca085bf8b71e');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('c07e6ad9070a267a2f8368f0f059b13d2a69f6e8384e2171a5dba0985fb038f2', 'postgres', 'Ed25519', 'c07e6ad9070a267a2f8368f0f059b13d2a69f6e8384e2171a5dba0985fb038f2', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:242047a1-d115-4a29-a6cf-46d4c9a82027');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('e316d12b6462925985008be1cbf534a5912100345fad8ea4b07bbcae46edef70', 'postgres', 'Ed25519', 'e316d12b6462925985008be1cbf534a5912100345fad8ea4b07bbcae46edef70', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:28727023-6a8d-4e64-902c-7ac617a4a0fc');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('35d529f44a031ebb5b8add01380960b6f2dd285845c80ba8a5086a39aeb3157a', 'postgres', 'Ed25519', '35d529f44a031ebb5b8add01380960b6f2dd285845c80ba8a5086a39aeb3157a', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:0dd6212c-6dc9-4374-96af-5461995694cb');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('94b2f517a5f7296b301d4936713f8e2a52bee54167f6bcfc836c9f76b52b44e5', 'postgres', 'Ed25519', '94b2f517a5f7296b301d4936713f8e2a52bee54167f6bcfc836c9f76b52b44e5', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:7d45e3fd-16e1-4ca2-8c2b-a6fe5efcc8ce');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0488bb1b70f3fa893cb40dea81578acd4edf96ec050cb7c0ee2512c7b1f970639947a675318c49e161b71ba35ca1d865d88ed2f6f2b8eaed7a8ab60335f1cde66a', 'postgres', 'Secp256k1', '0488bb1b70f3fa893cb40dea81578acd4edf96ec050cb7c0ee2512c7b1f970639947a675318c49e161b71ba35ca1d865d88ed2f6f2b8eaed7a8ab60335f1cde66a', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('046e60f4f60747640ef111c0aa9b40650467d2692a22830f26fabe0bfbb248f3c8be5874fc3f4c2ae7034fcbab9dac4c15cbe0353fe091a09240e288c1dc67a120', 'postgres', 'Secp256k1', '046e60f4f60747640ef111c0aa9b40650467d2692a22830f26fabe0bfbb248f3c8be5874fc3f4c2ae7034fcbab9dac4c15cbe0353fe091a09240e288c1dc67a120', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('042b4108bc653f73699a7ba7ba5448f2764584f9974c34023c64dd3a654f22bf1b04a8465c665f31985c8f894b0e63ae149f444de629855f38db0eebd0dd84860f', 'postgres', 'Secp256k1', '042b4108bc653f73699a7ba7ba5448f2764584f9974c34023c64dd3a654f22bf1b04a8465c665f31985c8f894b0e63ae149f444de629855f38db0eebd0dd84860f', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('c5378ce8993f3490bfa49332139430c7b9d742d9987bb09b8c45d6b6f08fc24f', 'postgres', 'Ed25519', 'c5378ce8993f3490bfa49332139430c7b9d742d9987bb09b8c45d6b6f08fc24f', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('9b5202352b422ffc8df21301a0f40bf74239fc2ffbf25b45feae9118100038c5', 'postgres', 'Ed25519', '9b5202352b422ffc8df21301a0f40bf74239fc2ffbf25b45feae9118100038c5', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('1fd4a3c320150bf8b6d1bf3d1b7a458bcc2bef26220e34c49a72bbeafb1e6685', 'postgres', 'Ed25519', '1fd4a3c320150bf8b6d1bf3d1b7a458bcc2bef26220e34c49a72bbeafb1e6685', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('8ef4dc3db33c9557cb9e44d9fdd0af6f9c16eb896fc25c3f63932ee50a95032b', 'postgres', 'Ed25519', '8ef4dc3db33c9557cb9e44d9fdd0af6f9c16eb896fc25c3f63932ee50a95032b', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:c5384b25-8448-4cc1-a9e4-e181947dfdb3');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('f75c2c97b11e02ae3fca9ecd6b35a8ccb260cbbdc1c05b02b08ce67b7216ac46', 'postgres', 'Ed25519', 'f75c2c97b11e02ae3fca9ecd6b35a8ccb260cbbdc1c05b02b08ce67b7216ac46', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:1d2c7ba9-897b-47b3-8760-3c569581f706');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('2cad7b50dda250d19c7ec40639b23d47747029be1be7cb21bebea5e41c8761cf', 'postgres', 'Ed25519', '2cad7b50dda250d19c7ec40639b23d47747029be1be7cb21bebea5e41c8761cf', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:c11b9a4f-adc6-4410-bd86-b0d9ff5046f3');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('16e3949958c9862ef9711f88aaafd0e79e65899dd308b55e3d3b3deaacfa6f55', 'postgres', 'Ed25519', '16e3949958c9862ef9711f88aaafd0e79e65899dd308b55e3d3b3deaacfa6f55', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:38e226fb-7a46-470e-ad2f-539046a3db0b');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('2b07a9fd44e3c1204112eddc002ad5e5488775f54e904cbee973c9575a5a4d08', 'postgres', 'Ed25519', '2b07a9fd44e3c1204112eddc002ad5e5488775f54e904cbee973c9575a5a4d08', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:b4ae5ba7-633b-4957-b75d-1420fee65a0f');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('a5468ecd54c0e2ef5d35ba6959f448da3e74a16ceaf58be39459b5ddbe523f0a', 'postgres', 'Ed25519', 'a5468ecd54c0e2ef5d35ba6959f448da3e74a16ceaf58be39459b5ddbe523f0a', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:76845110-6150-4152-9a45-b553130fdce1');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('de15199b8484e5550a93135b86cbb783ddba90a64bbb033da3c6b885c69b27f0', 'postgres', 'Ed25519', 'de15199b8484e5550a93135b86cbb783ddba90a64bbb033da3c6b885c69b27f0', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:72fad8ee-4174-44a1-b817-9312e6ae1345');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('b64139459fc8c5efe5c535af5ef0578223abf29eae1723e1d9a33ef1706c2765', 'postgres', 'Ed25519', 'b64139459fc8c5efe5c535af5ef0578223abf29eae1723e1d9a33ef1706c2765', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:76b8a444-4d49-4c33-88e5-459e365589b4');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('1a4563a5958b928514c60215545f587bce7a0b7f43550d8bb0cc784db20679e4', 'postgres', 'Ed25519', '1a4563a5958b928514c60215545f587bce7a0b7f43550d8bb0cc784db20679e4', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:cedfc327-0a06-4293-b3d5-01edcd0e72e2');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0477c0969475b4e2dff1f565418096d2436bfff23868a914da4177a9c11537cc70e7f9c70966164d97c5e41caeb834b2e6887ebb418d8911b3eaadecef35c8a5fb', 'postgres', 'Secp256k1', '0477c0969475b4e2dff1f565418096d2436bfff23868a914da4177a9c11537cc70e7f9c70966164d97c5e41caeb834b2e6887ebb418d8911b3eaadecef35c8a5fb', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('042c966a9abc89b5fa81594ca8722abf19148574ee084b058e2c0fd45f7b220e030537cabb9e5892fc4af0dcd3c1fd916bf528a9e75ae9123a817b2ef97d7edc66', 'postgres', 'Secp256k1', '042c966a9abc89b5fa81594ca8722abf19148574ee084b058e2c0fd45f7b220e030537cabb9e5892fc4af0dcd3c1fd916bf528a9e75ae9123a817b2ef97d7edc66', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('047901bb6ef2562d58a55f8834d0314d1525997d25e85de2aed4319abf9e26f5cf03f5e8589870ff783addbde0549af632eb1d3cae51750de30e4dda3bd0c6b0e7', 'postgres', 'Secp256k1', '047901bb6ef2562d58a55f8834d0314d1525997d25e85de2aed4319abf9e26f5cf03f5e8589870ff783addbde0549af632eb1d3cae51750de30e4dda3bd0c6b0e7', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('154ef9d918a2de9982599df007981627827194b32b1f8274ced38ad8b37b81fc', 'postgres', 'Ed25519', '154ef9d918a2de9982599df007981627827194b32b1f8274ced38ad8b37b81fc', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:e7bc1aac-cc50-4eeb-b2c1-16c577d7c94e');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('7ac2eb65f465d921ed9fa74bd2fb3acdf3bb75a17d0c3466873a075204efd723', 'postgres', 'Ed25519', '7ac2eb65f465d921ed9fa74bd2fb3acdf3bb75a17d0c3466873a075204efd723', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:db40ca38-4448-42d6-9fde-b59239ad0fef');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0468d90b345429cb78425ca4d8abef8ee6b9aaed583265c7c5a8d1c9e1a7fad366fa753287dfdffab46dc8b202d1c3233204d263392bb40a2089e6e54b24a301a2', 'postgres', 'Secp256k1', '0468d90b345429cb78425ca4d8abef8ee6b9aaed583265c7c5a8d1c9e1a7fad366fa753287dfdffab46dc8b202d1c3233204d263392bb40a2089e6e54b24a301a2', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('f9321a494b98982a50cde7e750eabd9791b37c99384f122d359c68e898ffbded', 'postgres', 'Ed25519', 'f9321a494b98982a50cde7e750eabd9791b37c99384f122d359c68e898ffbded', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:d8cfcf08-c3ea-4a2e-aad2-4169078ec523');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0440a3edec558cc77371595489c52c7bbf06bec937862042466051653443cd7efac0daa9a2992cb5b03e33f7752413a66bf6f34c0e29fd3a716b135c7aaf3193d9', 'postgres', 'Secp256k1', '0440a3edec558cc77371595489c52c7bbf06bec937862042466051653443cd7efac0daa9a2992cb5b03e33f7752413a66bf6f34c0e29fd3a716b135c7aaf3193d9', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0ed0ccc4ee2e153c713b46b035616c4c1c008090fea879de360a6ce31f430083', 'postgres', 'Ed25519', '0ed0ccc4ee2e153c713b46b035616c4c1c008090fea879de360a6ce31f430083', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:c91857d5-1245-4f6d-ab81-390282370436');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('049beed137ad630dd6bd525db9f51be1d28f08dc61e97cb3338e5ecc2e827d3eeb974384a64ed84c2292cae0b1afde0fb12b6464d9954523a823be29f57c081f81', 'postgres', 'Secp256k1', '049beed137ad630dd6bd525db9f51be1d28f08dc61e97cb3338e5ecc2e827d3eeb974384a64ed84c2292cae0b1afde0fb12b6464d9954523a823be29f57c081f81', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04dcd36642bdc212e69c13e86d5d62d71ce74d60f6933f0b9c6cefb98618f9c453a25282b0257c8a4eb545b8b62ebd0e150938943c289b14e4ac286192b6e602d2', 'postgres', 'Secp256k1', '04dcd36642bdc212e69c13e86d5d62d71ce74d60f6933f0b9c6cefb98618f9c453a25282b0257c8a4eb545b8b62ebd0e150938943c289b14e4ac286192b6e602d2', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('2c3898a7eab728b0e01c1f6bca5b31876a62dea45920ec8733822331c9b55972', 'postgres', 'Ed25519', '2c3898a7eab728b0e01c1f6bca5b31876a62dea45920ec8733822331c9b55972', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:139119e8-35d3-41df-940d-6e2037504e27');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('62818f4484407b2b836d07f7c8d3c4e3fb6a30a3a4fdeaddbe46e78a77e53539', 'postgres', 'Ed25519', '62818f4484407b2b836d07f7c8d3c4e3fb6a30a3a4fdeaddbe46e78a77e53539', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04d3fc51ea10db478f87369428e99d8ed18d748a57b940e0c8a173369e21e1b4699cfe70202f0e767298b76ab7840d0a6169da15cfae3d39475b27eb081f168e49', 'postgres', 'Secp256k1', '04d3fc51ea10db478f87369428e99d8ed18d748a57b940e0c8a173369e21e1b4699cfe70202f0e767298b76ab7840d0a6169da15cfae3d39475b27eb081f168e49', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('127d9fbdf68ad0dd6343c7e3fff64a60559f77b4d2b2ac38674d44f26697816d', 'postgres', 'Ed25519', '127d9fbdf68ad0dd6343c7e3fff64a60559f77b4d2b2ac38674d44f26697816d', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:33e08531-306d-4304-a8cf-147ccbf2e047');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04757c68343137e4216e4268626edba7a5da613297bdf1ff95e43eb9aec027d619b3f8975b5d8aa681096603f2c30198cf5e5edb70b3fed11ee39110b7e434e53d', 'postgres', 'Secp256k1', '04757c68343137e4216e4268626edba7a5da613297bdf1ff95e43eb9aec027d619b3f8975b5d8aa681096603f2c30198cf5e5edb70b3fed11ee39110b7e434e53d', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0431166a2525205490eabcd05c9bb7b687b44d229e8e40dc477b07bc92f58c188d6347711081ab85b54c7dfcf23826a4e3edb1ac04a43925b1a6f21c74e0be89f1', 'postgres', 'Secp256k1', '0431166a2525205490eabcd05c9bb7b687b44d229e8e40dc477b07bc92f58c188d6347711081ab85b54c7dfcf23826a4e3edb1ac04a43925b1a6f21c74e0be89f1', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('865be07a3f4f49fa289d8854aeeaadab5826f0bc012c1111d53aae24dfb6ec60', 'postgres', 'Ed25519', '865be07a3f4f49fa289d8854aeeaadab5826f0bc012c1111d53aae24dfb6ec60', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('c022b16fea0c2f975c14968650a0b9f54979e270cbdcf9d200c5c1a1c7a4af18', 'postgres', 'Ed25519', 'c022b16fea0c2f975c14968650a0b9f54979e270cbdcf9d200c5c1a1c7a4af18', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:mainnet:7dd80b01-070f-4f1d-a227-9d4c12f9e559');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('044e67482faf51383347b8570a2d2f096c97328393a1969bcbbc8dae6d8dc9cd0437273fa5981f0162adbb54f4bed4d1567ed8a3408dc74046fcd5ef4975ff59f5', 'postgres', 'Secp256k1', '044e67482faf51383347b8570a2d2f096c97328393a1969bcbbc8dae6d8dc9cd0437273fa5981f0162adbb54f4bed4d1567ed8a3408dc74046fcd5ef4975ff59f5', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('049c40ad9e7e4cae9feb7f33d881b58961fed0bd3eff54db1ebf7f7fb69e3fecf54359bc518569dc178cbb0734a9538cccf90f021b8c2c609933b2f1417d114ab8', 'postgres', 'Secp256k1', '049c40ad9e7e4cae9feb7f33d881b58961fed0bd3eff54db1ebf7f7fb69e3fecf54359bc518569dc178cbb0734a9538cccf90f021b8c2c609933b2f1417d114ab8', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04925bdbb504118b58acd5708daa429017757a38547139d25c71c38dcce80fa765c60899c1e55a9ead8e713479c4b4d66fbf2e64623f4048dc912513c052628287', 'postgres', 'Secp256k1', '04925bdbb504118b58acd5708daa429017757a38547139d25c71c38dcce80fa765c60899c1e55a9ead8e713479c4b4d66fbf2e64623f4048dc912513c052628287', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('4feb458d4bfaddf2472b69a546dbb38bf98d806e429a8ca9aafe51a8a4b9ef00', 'postgres', 'Ed25519', '4feb458d4bfaddf2472b69a546dbb38bf98d806e429a8ca9aafe51a8a4b9ef00', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:2e8daf5b-5ec2-4f35-8d24-ac27af44a230');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0a81e8db319138a0b05492613fdd59aba5e485d9d4e5f2c8e20a4b88b2ff4be4', 'postgres', 'Ed25519', '0a81e8db319138a0b05492613fdd59aba5e485d9d4e5f2c8e20a4b88b2ff4be4', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:30aa83a3-d541-4381-b1e3-e080b51ef8fb');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('595c856060cad66616a9b400ad4da889c8b8281d10ed453ec6e6e29e31100b72', 'postgres', 'Ed25519', '595c856060cad66616a9b400ad4da889c8b8281d10ed453ec6e6e29e31100b72', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:cef7c4b5-d864-4b4a-a6ca-a932ff37b987');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('2d8d59793817774981ed79eb3d2a891967d112afc5d4e19bde52fdeb8b8be680', 'postgres', 'Ed25519', '2d8d59793817774981ed79eb3d2a891967d112afc5d4e19bde52fdeb8b8be680', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:874715d1-1e41-45bd-a45c-6dfb685fc08b');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0498ad0a233249b4c432e61e29cd635a20a96f894a5aae57a1f0a0a4c06153aae61e4ed7717216c98826a221023aa56f7b019eeb520aa2f50767c214d0d7a47be7', 'postgres', 'Secp256k1', '0498ad0a233249b4c432e61e29cd635a20a96f894a5aae57a1f0a0a4c06153aae61e4ed7717216c98826a221023aa56f7b019eeb520aa2f50767c214d0d7a47be7', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('df9229453c8d3a6bee43cf0b73148d5d2d2bd410f88951fb99c3458fa095ee6b', 'postgres', 'Ed25519', 'df9229453c8d3a6bee43cf0b73148d5d2d2bd410f88951fb99c3458fa095ee6b', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:5be5713a-bd28-4d6f-b23a-377378c21a18');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04a38c02368ae890ce16bd035f821baf0589f7e9605c6c0f01b025d2ecd0e8ea0c1addb1dbb326c3bf17ef751414e2f9660e22fe9133e935a564e733938a21c584', 'postgres', 'Secp256k1', '04a38c02368ae890ce16bd035f821baf0589f7e9605c6c0f01b025d2ecd0e8ea0c1addb1dbb326c3bf17ef751414e2f9660e22fe9133e935a564e733938a21c584', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04aba4b7e19c69b2c24b6543b3c7025b30c82a3152de229a0ff159a0a854d9962a224144713cb5ad44e2c4fd78f1f4debab0e8d5d2f5bf933438572ca667d5b827', 'postgres', 'Secp256k1', '04aba4b7e19c69b2c24b6543b3c7025b30c82a3152de229a0ff159a0a854d9962a224144713cb5ad44e2c4fd78f1f4debab0e8d5d2f5bf933438572ca667d5b827', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('b26cbed7a31d36b8fc79a1473d05d267ad06aa2dd4a393187707cc77bed1062a', 'postgres', 'Ed25519', 'b26cbed7a31d36b8fc79a1473d05d267ad06aa2dd4a393187707cc77bed1062a', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('20a651a85b41986019049e1719a907783bfdcb18e4f3acfaa59a4affc01f69b4', 'postgres', 'Ed25519', '20a651a85b41986019049e1719a907783bfdcb18e4f3acfaa59a4affc01f69b4', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:0cc0a3bb-b7e9-4888-b41c-c0a018fa5e5b');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('44b7187bf2b81e6704c42c1e9e3496ca687139c77d2fcfa4e5a707eef126155a', 'postgres', 'Ed25519', '44b7187bf2b81e6704c42c1e9e3496ca687139c77d2fcfa4e5a707eef126155a', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:0e990794-9280-4be2-8629-0da95423ffc0');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('90731085833bc837ea1dce9f1fd4cd2bd237c5dc2560df97cf24898d1833a2be', 'postgres', 'Ed25519', '90731085833bc837ea1dce9f1fd4cd2bd237c5dc2560df97cf24898d1833a2be', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04ddbdf1d89c8a02b4d1661d01e337656a9de93b2c3021981f568b754965008cde305126782bd40c15abf1d77226b0500a4ad757c923752e5996c41490a38b3660', 'postgres', 'Secp256k1', '04ddbdf1d89c8a02b4d1661d01e337656a9de93b2c3021981f568b754965008cde305126782bd40c15abf1d77226b0500a4ad757c923752e5996c41490a38b3660', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('6535953482fef27c0569ddf3b11adae500538c3c9b91f04ce23428f0f60a254b', 'postgres', 'Ed25519', '6535953482fef27c0569ddf3b11adae500538c3c9b91f04ce23428f0f60a254b', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:591d7791-5c13-4e33-9488-03576f20ff7b');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('a5ed01da0191866ab3a967fb2721d40fd20ceb64b5f878febf4a40b1ee2e7f81', 'postgres', 'Ed25519', 'a5ed01da0191866ab3a967fb2721d40fd20ceb64b5f878febf4a40b1ee2e7f81', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:6b4c1604-451b-4af9-b193-66eb09e60d6b');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('048ea1ebb81e422338644cc0bcd49b0e1d41ff548dc3feb37b49fec98cce9e67182c7b5018944b15cb1f630fe4090759a403a01b4bcf1dd0e475d0feccd998bc6d', 'postgres', 'Secp256k1', '048ea1ebb81e422338644cc0bcd49b0e1d41ff548dc3feb37b49fec98cce9e67182c7b5018944b15cb1f630fe4090759a403a01b4bcf1dd0e475d0feccd998bc6d', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04f873625c463d98d8b572d4fd2e78a5b1d422e129e7b9d8e23b56c7521f8b1c88de30ad65df3cc7d54d5f6ba138d7320c9266e1ea5f3403cd4c2b85d044b79aa0', 'postgres', 'Secp256k1', '04f873625c463d98d8b572d4fd2e78a5b1d422e129e7b9d8e23b56c7521f8b1c88de30ad65df3cc7d54d5f6ba138d7320c9266e1ea5f3403cd4c2b85d044b79aa0', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('0efd899838a95188472cea8dcb735651faf84d2bd59ba9d1038f274ecace4318', 'postgres', 'Ed25519', '0efd899838a95188472cea8dcb735651faf84d2bd59ba9d1038f274ecace4318', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:32131a75-fa96-4ff8-b782-d1e70982e384');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('3d8bfbceb0ab85f880b7ac597ac2d74cc37dbebf2a4b9b61e7bcd4152553ce39', 'postgres', 'Ed25519', '3d8bfbceb0ab85f880b7ac597ac2d74cc37dbebf2a4b9b61e7bcd4152553ce39', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:6965ccce-c380-4d92-9af6-b661054fc475');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('046025baf96995e2395882052069a7e5fe369b27d1abe2c94e6b3a2ff9e02abf45793bae6cba419d41a2d875ab9bc161a8afd98a9420dc49aff49f49464c41cfd8', 'postgres', 'Secp256k1', '046025baf96995e2395882052069a7e5fe369b27d1abe2c94e6b3a2ff9e02abf45793bae6cba419d41a2d875ab9bc161a8afd98a9420dc49aff49f49464c41cfd8', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04c519047b10d49f38a2113066087e95221b59659f6e91d5ea9be91ec58d80aefffb9682deb4bf0b005a0bd0953ca3013f3dedd8e7f73ab2a7e21733bcb68aa766', 'postgres', 'Secp256k1', '04c519047b10d49f38a2113066087e95221b59659f6e91d5ea9be91ec58d80aefffb9682deb4bf0b005a0bd0953ca3013f3dedd8e7f73ab2a7e21733bcb68aa766', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('053962683659f39d83f590226c80bec4a4c29ddbf8464321518223847067b93f', 'postgres', 'Ed25519', '053962683659f39d83f590226c80bec4a4c29ddbf8464321518223847067b93f', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:a8c06af9-38a1-4239-acb9-510cf61dc7ce');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('3d743e2960430c15cd96a423dd71bcb6c7a95a2ca4c35faa4e8655b9c62807ed', 'postgres', 'Ed25519', '3d743e2960430c15cd96a423dd71bcb6c7a95a2ca4c35faa4e8655b9c62807ed', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('54bda69d8f011c350c22bb44247c0fc4f16798db1139ccdf4f30e4ff10e3bb7d', 'postgres', 'Ed25519', '54bda69d8f011c350c22bb44247c0fc4f16798db1139ccdf4f30e4ff10e3bb7d', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('d149cfbfba19ac1eb0ee7e4885596a0c11000020839c67f1d181a2fcdf252d34', 'postgres', 'Ed25519', 'd149cfbfba19ac1eb0ee7e4885596a0c11000020839c67f1d181a2fcdf252d34', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('9a6c1bddde79a50e9861a009b0cf02d146df43b3f9cf622ad4a2f473dd012d7d', 'postgres', 'Ed25519', '9a6c1bddde79a50e9861a009b0cf02d146df43b3f9cf622ad4a2f473dd012d7d', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('8660beb65fc803d0bdec1272d84abc9f226b79656e946f9f72501720803991e8', 'postgres', 'Ed25519', '8660beb65fc803d0bdec1272d84abc9f226b79656e946f9f72501720803991e8', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('be44d08c81c64519279aa9c201efa5cf58f47cb04d1455fa780946a8d7e09bab', 'postgres', 'Ed25519', 'be44d08c81c64519279aa9c201efa5cf58f47cb04d1455fa780946a8d7e09bab', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:514ec4a5-463c-4fc2-91b1-99bff82aeae5');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('b9e75dad0e18858744cb9a4f132065444ea81040d41e281009b1ef161f825ded', 'postgres', 'Ed25519', 'b9e75dad0e18858744cb9a4f132065444ea81040d41e281009b1ef161f825ded', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('53bdfb9bd9618672e572bd06917bf786f42a35d31986f2e04529be4fd1e69f3a', 'postgres', 'Ed25519', '53bdfb9bd9618672e572bd06917bf786f42a35d31986f2e04529be4fd1e69f3a', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:7nqSJBYpGpwicy7zww9PSH');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('c1243cd7d87a03adefad18e09914c7cfcaf3ce84132d9c07570f9d5b71aba771', 'postgres', 'Ed25519', 'c1243cd7d87a03adefad18e09914c7cfcaf3ce84132d9c07570f9d5b71aba771', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:1b9ba7a0-9541-4f7c-ab14-9c3637e6a170');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('b83edc876a031a37dbf36f35e8dee05c4b18e2b305f51dabb21869647ea6cf00', 'postgres', 'Ed25519', 'b83edc876a031a37dbf36f35e8dee05c4b18e2b305f51dabb21869647ea6cf00', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:240c9b1f-9eb5-4bf9-a9ce-bb9fd99bb073');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('519774ec7eb7eb149799b8ee66a4f90bc7de7ce0fb05b45f432494b55d1ec3d2', 'postgres', 'Ed25519', '519774ec7eb7eb149799b8ee66a4f90bc7de7ce0fb05b45f432494b55d1ec3d2', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('dd57367110b44cb79700c06daa54eec92f254344d3845606d934717371740c1e', 'postgres', 'Ed25519', 'dd57367110b44cb79700c06daa54eec92f254344d3845606d934717371740c1e', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:fdc20a18-4085-4cf6-9735-e9558f1258be');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('f38bdd03c3aa34f1f4390fdaff2badd40bebcc2f77a3337f663e991ab39e7396', 'postgres', 'Ed25519', 'f38bdd03c3aa34f1f4390fdaff2badd40bebcc2f77a3337f663e991ab39e7396', '{"algorithms":["Ed25519","EdDSA"]}', 'did:cheqd:testnet:699159ff-fd86-43d1-a375-7dcee9fa6021');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('041bf6b6912512f13d574709c0b1ac6efb6de5d91bda4363ea1a60da4002be7f31ff2229f5f66a8e52c17e4a3e9a4b14caea7a40c816e3c6e4452b7853ec4154cd', 'postgres', 'Secp256k1', '041bf6b6912512f13d574709c0b1ac6efb6de5d91bda4363ea1a60da4002be7f31ff2229f5f66a8e52c17e4a3e9a4b14caea7a40c816e3c6e4452b7853ec4154cd', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04f881d5ae2c3dfcff999971b3cc161a24cd5a6caebcddab43410a54902ff08a839f2343c4cee351fea15bc09e8e2f9e78752fe7beb759b139daa5111b53b30942', 'postgres', 'Secp256k1', '04f881d5ae2c3dfcff999971b3cc161a24cd5a6caebcddab43410a54902ff08a839f2343c4cee351fea15bc09e8e2f9e78752fe7beb759b139daa5111b53b30942', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('e398b1a73eafcc9d1536a3b28e2d5be017007c515468b8fe28ade3698d878685', 'postgres', 'Ed25519', 'e398b1a73eafcc9d1536a3b28e2d5be017007c515468b8fe28ade3698d878685', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('7f4f03875648766b35f44c2c004b8d1e8790dd86dddf5a97162880fe4cd2b101', 'postgres', 'Ed25519', '7f4f03875648766b35f44c2c004b8d1e8790dd86dddf5a97162880fe4cd2b101', '{"algorithms":["Ed25519","EdDSA"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('046f8c9e30255d587147601809f1aa18909fc4f99f126060f26ad42e0575c0f0cb39704f4ebed134ffca5dad7c769862b82a02568f8ba8af8833b10be17231d24a', 'postgres', 'Secp256k1', '046f8c9e30255d587147601809f1aa18909fc4f99f126060f26ad42e0575c0f0cb39704f4ebed134ffca5dad7c769862b82a02568f8ba8af8833b10be17231d24a', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('890b975720d6b61c7731de117341b14bded7ff918ba0c45fc93d4a8ceb8a4956', 'postgres', 'Ed25519', '890b975720d6b61c7731de117341b14bded7ff918ba0c45fc93d4a8ceb8a4956', '{"algorithms":["EdDSA","Ed25519"]}', 'did:cheqd:testnet:33cb7b21-3c9d-422c-be01-7072f66da067');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('b6e888bbd41053c9df95e3d534d60e52bd097ec8c089076a4fd66c13925dcd81', 'postgres', 'Ed25519', 'b6e888bbd41053c9df95e3d534d60e52bd097ec8c089076a4fd66c13925dcd81', '{"algorithms":["EdDSA","Ed25519"]}', 'did:cheqd:testnet:85197ae7-a2b6-4b3e-b99f-63408056d1cc');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('78cbfa7a0f952580bb9b4df8db9809025dfb6a8eef083c52fe918e520da3431e', 'postgres', 'Ed25519', '78cbfa7a0f952580bb9b4df8db9809025dfb6a8eef083c52fe918e520da3431e', '{"algorithms":["EdDSA","Ed25519"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('f63c3aab6ee25033a8a48a268010c5fbafacdaa5c808ae17aadd0b5dc237b19f', 'postgres', 'Ed25519', 'f63c3aab6ee25033a8a48a268010c5fbafacdaa5c808ae17aadd0b5dc237b19f', '{"algorithms":["EdDSA","Ed25519"]}', 'did:cheqd:testnet:3e69c28a-c293-444e-9686-b4c5da59638e');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('04c1fbcd77bb048539012cef4cb07f18149fdf783c7a58c40ae6d119c6ba8af8d6114a4d2b75eb74e5cb6aa806603f1cb0a7cff1870344746462ae9c891130dfd0', 'postgres', 'Secp256k1', '04c1fbcd77bb048539012cef4cb07f18149fdf783c7a58c40ae6d119c6ba8af8d6114a4d2b75eb74e5cb6aa806603f1cb0a7cff1870344746462ae9c891130dfd0', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('b04dd7eeb929db57c3aa707efc53a86c686a75e851aab855f05b977cd404b2cf', 'postgres', 'Ed25519', 'b04dd7eeb929db57c3aa707efc53a86c686a75e851aab855f05b977cd404b2cf', '{"algorithms":["EdDSA","Ed25519"]}', 'did:cheqd:testnet:79ccd6f5-2953-461a-b2f1-b5b1617b3e72');
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('042902fb45ec9b06f0972adc970fb320f845c06a5de5c841d5def7d28fc8241c0b3cf0086e2301a1f7a815902c3addfbf90afd21c07feb0965198b52e7338e178c', 'postgres', 'Secp256k1', '042902fb45ec9b06f0972adc970fb320f845c06a5de5c841d5def7d28fc8241c0b3cf0086e2301a1f7a815902c3addfbf90afd21c07feb0965198b52e7338e178c', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL);
INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid") VALUES ('79502c0f56ddf87e4b6a7978c34b0a6f8d1c44ee2ee8565d4ba85000e20bf2b6', 'postgres', 'Ed25519', '79502c0f56ddf87e4b6a7978c34b0a6f8d1c44ee2ee8565d4ba85000e20bf2b6', '{"algorithms":["EdDSA","Ed25519"]}', NULL);


--
-- Data for Name: message; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: message_credentials_credential; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: message_presentations_presentation; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public.migrations (id, "timestamp", name) VALUES (1, 1447159020001, 'CreateDatabase1447159020001');
INSERT INTO public.migrations (id, "timestamp", name) VALUES (2, 1447159020002, 'SimplifyRelations1447159020002');
INSERT INTO public.migrations (id, "timestamp", name) VALUES (3, 1629293428674, 'CreatePrivateKeyStorage1629293428674');
INSERT INTO public.migrations (id, "timestamp", name) VALUES (4, 1637237492913, 'AllowNullIssuanceDateForPresentations1637237492913');
INSERT INTO public.migrations (id, "timestamp", name) VALUES (5, 1683723285946, 'CreateCustomersTable1683723285946');


--
-- Data for Name: presentation; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: presentation_credentials_credential; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: presentation_verifier_identifier; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: private-key; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('049c6cee06184b60ee556dc6dd3b306e3f041e8c8940e6b18aa26e8b5283fa2061e964da93df91891d666aa9339014fc7561e8b5a5b963adbea183e308db7be8a8', 'Secp256k1', 'a032d218d25592a73729739684856d22b484474491e1904ca9d5d22f4841a47a669bb79880bda4fbcbf3e605785765bbeffe4a49a0224627a335292bfd4b63a3c66943d7ee060592a0ebbfb8f8801db8b75362b97c2a69c61855f453a9ee9393818ed3178b76b4bb');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('e5510ed495584e734c2fc3d4fbfe5a7a704dea0c0d709c1c7ebdac789749fe0f', 'Ed25519', 'ddfd5a1533708efe3117af55646623050f0b3ab5854c5ff1147813e9689d0306b3e9ed1355275806ca878968c742fb284a91a560cd3452c678528962ac1d9f4a3af5747954902b9ee46399d3dc720151a3f1f04c48e72f449197e2a44b54288060a88b101553aedad12c562e2a20ce3975c00872109ed28897838aff35f60118f05269240ac70b1b711a94827afd508a993591ec2dc0e062e2481f46b98dd570b5e32d8c04e472a5');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('90fa84f1532bc7c98ddf9499661a5876653a6afebb4f67dc039e16efaa7b6c3e', 'Ed25519', '09437bd4ec5822239f183411ca14b54a9a0c1061255430b4160d07c003f87c9e12edad77c0bb0c89bfbb26ceb610c927dc45944d0be4ff78d17b19b2f39b2821d0cfce3fcc7413b89068f79a1d57db81509e5ec9e7d75950a24f113b81543a2d8c566acaa480ab0d312f8f942c4cd8b4762213e26b0f47e4dac0107a2d5a260a00ca8c7b188279938093decf20fb23a786b51492e6df6e4335fbde2e4ca5c0bb494aa62b9d552c58');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('1afb99a50476e209dbb6d03934116528183b8a4cc34c2cdfe6df8448d3e4807a', 'Ed25519', 'ca195112f8a5a4f808a1780b1d70e91c52c86b552a5292bb972d5c5787937414bb91e58efdb7a360e99fd19f1abedb2f648d885e7346dd1f1bda9c4b8810f6bf2e4a7cdad8b724c58cb143e1be856a68d805c340aaf7c4d83a4febc3e64955bbbb37f6ad238c3df9e70f8fe5d3b18be4a41be24f413d85d0a6cd4270c51d8d51f9076961da649d642fd1721183cd753afe468525f12e5d7de8d5363fe0460541496b3a10308f2767');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('471a2c07044371547719253a5899225eabb932ff628b5898dbc85b2418e3e22b', 'Ed25519', '9860305f3fe1785c5b037e3fef0288806729189e9ab9a9f0619eebefcdeddd78eafb715feedd124fe8d6bd824157458f58e87cce1a801c7fd8489613faa19a22df79277b60b449cf7b519b36d880851babbf70642108f3702b39f9c6c67e481d85b7ef065d37ee6a7a2b77dd4a6a41bef1c77aeb26c939678e0034be825a91d630599baef74f9fc0c3f721a62cda4a79c88330e50f95bf3c104e483632855545162e4b4e00fdde23');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('4f31272af3a596ba80729e1eafbb5045d4c6a3b970ee7373b8347a516ad4d938', 'Ed25519', '1085d29f57707d373bbb69f8222d25818e33ba0dad577372c1c6e15a73bd4554431d6f7e996fc9c506c16ce1183aa1f6b944ecfe0668a1e6a30df75a1acb665dded152686ff264c270df35440c64576222eed60ec7eb5ab9e06604b44cd07546036437d63cc9d4ad134f2d0d44e62cb205c2d16f9cb4aa9092bb4e7305689a4f8faf1f52b7fea54a37874cad12f1257f3559fe8b454192bb5724868ae7c307560aa4c646bbeeed5b');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0488bb1b70f3fa893cb40dea81578acd4edf96ec050cb7c0ee2512c7b1f970639947a675318c49e161b71ba35ca1d865d88ed2f6f2b8eaed7a8ab60335f1cde66a', 'Secp256k1', '5c977c672b223c8e83886568250182810d601a3f35e4f1c701045b3fd50036f5e113c0cdb9526f2fc9a1b0c893e51ef1ea53ff108aab1f26578f8a6339dd7904e73565b82617dd9e5de7aaf3d4c1efa789f430583180add4a341b8b1e4d3ffa015f47397177b9336');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('046e60f4f60747640ef111c0aa9b40650467d2692a22830f26fabe0bfbb248f3c8be5874fc3f4c2ae7034fcbab9dac4c15cbe0353fe091a09240e288c1dc67a120', 'Secp256k1', 'd21638b7097cce90702e0c0bf6c926fdc5ef20394fe793446f8a50848169dddf88cea4817e2209ce4d41c1db779aa6ef6388e1ed8ef08213a5bec5ab3e64728de56c6169668de706253039dea06c357ef4bcc37e7c3c69932927e51a634c53539fccb1217f4adb9f');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('042b4108bc653f73699a7ba7ba5448f2764584f9974c34023c64dd3a654f22bf1b04a8465c665f31985c8f894b0e63ae149f444de629855f38db0eebd0dd84860f', 'Secp256k1', '7fe090887060d6b56238adae9066d3df6a7af6718d07e60b6b20b12a28813bb771a622f9cc0e49f5cac8569084aba7f1b7bce7634d6fd8fa453925ffe497516910559f4562dce28ca016a154bd36af1590dee41c3a12c4808800e786ea07e95fbb6874f517bc7ee3');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('2e74a9a6a50408e584a418d6b3dcac8cf041236e6aede5e7e53d7ef4084a450b', 'Ed25519', 'b4ba6870a017f66f98f7901d1c28f945b0c4ec79687ea3aea51c2570b42b37b9229ec1bf682a55ec257fb6d3ffe619c44f366e32f2cb1c7f7defd834c20dcf126d495b281d2ad14d4b5e65e2f56b6ae388d1b1892c38dc9b0fe54a6771861ddf077c2ed0b8705f6d035a455aeb522acaca801f73abfdcca5deadc024297ec4ea76220417e693ec3bad3893a85f62c1224746bfc365b5935f46935b6f62993b3f82abc3db413f4672');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('c5378ce8993f3490bfa49332139430c7b9d742d9987bb09b8c45d6b6f08fc24f', 'Ed25519', '012421581d3930c92f6b369fbe96ce931e63067c45b33155f3c88ff6786ff3cf189eb25b37c13be3dede85c2b2d8809bab7cfb156c7f96140ae104ebfdcc2bb66bbb48d004ee90fd033a3477d4f2c018255802da0aa34aedbfa2004986ee2ea4c15e5c3725914b229657ed1d2d974392aadd5c0e3747370ca0de12c489da121a1d4a1899b48713e0a1ffb96c1886ecd5eb9b06a0da82254bbd18f75e45208cdf12280d54ba8d3cde');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('9b5202352b422ffc8df21301a0f40bf74239fc2ffbf25b45feae9118100038c5', 'Ed25519', '73b4387fd10ebaccaa731caf5f8dcbf48471ead70174854b214855daa26b2cde99a6379bd32bd290dedd9025c4d56b13c9675e8eddc80b71c72e9f29db973d8921c1bf2b250e007a4d6f9139d3feca2cb29225f3f0a2a66d171422580f1d1a49596c2bf2da268219c269bba4d551e7167784f3fa167c5bbacd069162913bbcba053935aec3cf80370c092624af782e1314869ff8015b5d915586502a2696a4b58173b0be814432f7');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('1fd4a3c320150bf8b6d1bf3d1b7a458bcc2bef26220e34c49a72bbeafb1e6685', 'Ed25519', 'c0d6769ae07612e6ba363a5e8bdac8307b70f3fd2508a696191ab93ee5ecfc26cb9d91652a02c09729484fe6e2a3cbdc6368e148087f25ca27d4339c84e42f55d9b5c89f37a945fa5651524f6bec95bce8445bcc6dcf1a6ef27dd3187b924e0066d15f80558c457a9f66631d88c5e8a5f92381a36ca35f927f6685be64122a0fe4109f25e16561264ee91560a56866cacfea7a8e4b59219768a23519a10d93ec312a337dd1e9681d');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('8ef4dc3db33c9557cb9e44d9fdd0af6f9c16eb896fc25c3f63932ee50a95032b', 'Ed25519', 'a80a4f2e484f5a059ea3d8802b6a898aaeb47fd557b0dd53454163075a5cd17b71020e0b323d0c734fea69b01d13c984b69f0ec34ee250b7037bf3ea8a0c2763b83b2ac345a2fdcd4a45ab6a213811628d1d85b099a280f01176a66f55b2597a1143c8db6cfa91a4f3f9cb6cb163e00da469b5f653c2a1d0e0635cfde23a2173da85ab29381719379ea3486c86497bc61febad42fc2fa0a0427baf1eabb08251a2bf585b420d3f44');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('f75c2c97b11e02ae3fca9ecd6b35a8ccb260cbbdc1c05b02b08ce67b7216ac46', 'Ed25519', '2c7ba3ef5d00c3aa83d4b649f38b14f4fd5caa3f679d9b90276108c216cd7e8ab01db990ddb7eb981d6cad10794fee18f4fe74a6716ede294e90bad55d36ecc077d178c3614f06db4f9623c4950f59fa71ff7082e3a2bee25fe4d0d2dc8facf515d03c9091c286aba0d922162124a81046c8cc50eef4b905a08f7f8a33f46b9e3f21852e419f38ce86d9a8d31ef26a3066f2c7f352aab6b54c7ef7ef80d250b2532aebd3ad46516d');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('2cad7b50dda250d19c7ec40639b23d47747029be1be7cb21bebea5e41c8761cf', 'Ed25519', 'e83735eccbddcccd5aafa8dec5d2cdcc4c33c2548e1c6eb8eaa6879a1f2694cb70367c5a96cc7b1fea1d94691540f3c8b118d9c4c4399e38b92c7cbc5465c6e15dc7cbd5772a39b853d58dd3f5e04cd3c6bc7752a70660b2a17bfffb0f9366b7d473c1eb89ab0fc4b4f4eff96413412e227bb07e7ef3ad986a79b331f2a077dde055676526a38b6f9361fa7ac906dfda35d92f0edb1cf4737664cecf5b82a392fa7aee3ca89eec00');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('16e3949958c9862ef9711f88aaafd0e79e65899dd308b55e3d3b3deaacfa6f55', 'Ed25519', '2959b179ea487a3556c76082e0c5087165e82f8a15b4e2931c2612e69214b0a3e5b8c4c8b0b104d44904e780037c2ddec826a3a888b65db3ce2de9aa825fa48466186c63b533331c8691621a2639a91c14d4c8fb4c73684bf7627c20cb97ee6d9d65899d2ab7a98bcb0a42040288426483d5864d82e802dcfb0e5d4891028ac1126a7b74d9054ce417b197d133bb0b9693cf383228ca8a90bd220e5d7ac4c28ef6284a908abd8f06');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('a7fa224bb1c23da44dcd92ea303d34020348fc960cca9b645477464e0a1b4459', 'Ed25519', '1605491d6b4d3b83d021c87cf1df5e7419a86a18c5d5f4a982f999422743e76d749fceac6c22424e3122eca50d96392500f0026b7a329f9fcea61605995bd657ddedb9a39bf1b5dd1bcc079263d0ff2892bf4e6d087663783008d0ffe8e8100039ca6d3e297b2d2e40c45b96f797fa4b408b7ee7160e849af522e12acafccdc04fc05ba23a4d4433bc2d98c28df9605030ed2f63f7b8d4c89b0444e32111b6d9d78490ed774f9779');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04f881d5ae2c3dfcff999971b3cc161a24cd5a6caebcddab43410a54902ff08a839f2343c4cee351fea15bc09e8e2f9e78752fe7beb759b139daa5111b53b30942', 'Secp256k1', '408ab9dbef099ddddd0c4e203dd8e3a7b9d59f128b2d949f2f439e0d376361bcd2a5c4f7116411e0524314244838a1f59c297bd501708d23c0da2ed872c12a48d38a5afc859ec89eae05225babb3c8b00e98738bd79e9bf17c3287ea7670d7840c00761513804351');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('2b07a9fd44e3c1204112eddc002ad5e5488775f54e904cbee973c9575a5a4d08', 'Ed25519', '631b812ade47be62bac8eea3a6a31ea83a714f6b43c69191fa4cdf05cc3c5c268ac5660d79a957c5b003aa0b8f169be2a096f52121ae6c0f8c15249efca754cdef5ea9111d5475ef2a9940039fd8f2f4eff3f79916b61020e492003e34b2f3dd74f4255e694ea7415f1b22c42ae3b231ca80323db4f336b0ac5405c158417bbf7ab67f389fe2b9d5dd8e5d4ffa2f2b571e6880b5192ee0dc9d223860642b3b37e07ee499cd12ae49');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('a5468ecd54c0e2ef5d35ba6959f448da3e74a16ceaf58be39459b5ddbe523f0a', 'Ed25519', '068f542d11bd723d63f5582efd66d2df183223aabd9c4c392c142d4de4945eeb15e0d498844c452249d05ed9b11e1d1aa23ab8a5e748d78bf284d0fd3ea916b2af660d1acfe0e1181dea01d6e62e83094d93fd810b2b8aa6003780753fcce967cf59677ec0de184091962bcae41ee5a62aed221f31c9fd148eded7f2151ad66bfc5c860e91d3f298a18fc6ce8bb282a9751aa11a91e4dda1c9ec1a69e59f794f7d1401dcaac823d1');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('de15199b8484e5550a93135b86cbb783ddba90a64bbb033da3c6b885c69b27f0', 'Ed25519', 'dbf0ef368748cfad2d035321613469335e61d936cf23dd6ea9cabd0eefd6e03000987368f82e98b3db8d149b8c3b5777ec241e1ed56c3d83f8f8defee49886ea9649dd45a9776d3fd84326d9f6cf495b5b25259a3b41e4703b5da7a168464e19dba9dda24f9ef99c0e91f7c9387bc4c12d1c2751cf6583ad027f146205105de771d142d85cbe7c3890632d5b30f589edd3a1b98eb6bcc7093d0d27799cde640facbdb71d648e6b3c');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('b64139459fc8c5efe5c535af5ef0578223abf29eae1723e1d9a33ef1706c2765', 'Ed25519', '8a198c3d9690e49f1678c98e79a425ba4a5bb05a11e4acba9616432ec8acd2205bc360cb1f6c556414a5cfeb05317301323ffb23724a97eae54ee4babc6e9f975288103b20826f89ddc227473233b1c3bd9e0f5f645ae4c6b2ee21fc7f62c760f8fc771f0cc82acb501274e267f3b6380f9c451f7619c6aca65a33cb90746c083fccf9e0b9ca068e9630cb856e03422ac3ecd57782e47cc2892b64192022e0d1116246e581e74715');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('1a4563a5958b928514c60215545f587bce7a0b7f43550d8bb0cc784db20679e4', 'Ed25519', '554bd53fca9a815ecd42f0607ead256f1e58accb0b4a2033372ad44fb8cf36d94d924be0dff31d32115cdc232e14ca0cb1fccd4bc9912abf9b9485e360594e8b8270765133ddc3487e4be58525b11174677207fccdeb0e1cfbfbec53ad78f1aa3c3d66bae2e0c8cbf298c63c15179bb20bca74d216cce82da6bcf1b524aca7f080c1c51cd0a4d41064a6e6a38ac8d2f377ff358f7350edd73f9213e38fb5516e03a3cb21fe61d3f6');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0477c0969475b4e2dff1f565418096d2436bfff23868a914da4177a9c11537cc70e7f9c70966164d97c5e41caeb834b2e6887ebb418d8911b3eaadecef35c8a5fb', 'Secp256k1', '868372190e074d89357032c52b9b0d11005f2c0e9a8d75677fda4ac8cbb928cfd40973872140a8d85810be3640c8695c572b004edb730295c35ea7bd128980cb8b8c8b3b64ce4321d71772289abad91814700f05605889ff6d9a365f81b7ebcb72d4e596abb3bf7d');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('042c966a9abc89b5fa81594ca8722abf19148574ee084b058e2c0fd45f7b220e030537cabb9e5892fc4af0dcd3c1fd916bf528a9e75ae9123a817b2ef97d7edc66', 'Secp256k1', '4b66a4f6fa0f09e94b3b1c7f1484e42241647897cfa68bfd22f654843abaab18219350ab125f261f18ab896c78c068c019099ebc75fbe300e52531160cf531a89057285cb30ca5af81ad3f92966f6fab1b23d64d129884096d11d8cdbe69308579f0c553e81a9784');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('047901bb6ef2562d58a55f8834d0314d1525997d25e85de2aed4319abf9e26f5cf03f5e8589870ff783addbde0549af632eb1d3cae51750de30e4dda3bd0c6b0e7', 'Secp256k1', 'c340a893d33bf2cc71503e8b7002309e266f650a68d936a7db9a590c3b328fe9cf2dfe6a098f3bb543f141ab0f74737f339163c686a19f3cbf5396e2648792dbe2ae84fe151df0c8058259b659a2c1142107ce303aba16f85c2b56758f3d9a58bff7839c5010439f');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('154ef9d918a2de9982599df007981627827194b32b1f8274ced38ad8b37b81fc', 'Ed25519', 'f76ad666d061a139048f2d95dcb00c77448ce85dd14bfa622770fe1dbbf713d91d15d6050166310f19ad46c7fcbb8353112f656bc62f14a9e61126f26497daea93ce67206bb727978f50bdda8ddbdd887829fc1be72e453b32cc1cec43ff71e4fff9a7eb0b92570822c0b31842902c58bf20a8671f5a5b804399e9a97d0b98dd62bb3650d6a9779e04587fda5608b190bf2990aecfc59796cf2b32e75a6ef16d37fe819a7ffcc96b');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('7ac2eb65f465d921ed9fa74bd2fb3acdf3bb75a17d0c3466873a075204efd723', 'Ed25519', '3e6bcf60ae2e200b72d5832dfd677bf74c065f35bf7eea68432409e3da7b3ba4a6d75378b7c887ca437b7ef8e3e488ba82d30ebd28bc854ed624f49f9f58f0174198bad9627c1f4ebcf947f42abc16a5d1780f1b84cda7aac3fa21c541edb289ddee657ab13371fba6d4d27630b991c16efdd43aaab9a8cb0a4f2634c1a387c3e8ccb3593cd6159e1c9b98b0c46eeaf7763aab05e3a49d2fbe244018d26c6ee93269593dd700ffe0');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0468d90b345429cb78425ca4d8abef8ee6b9aaed583265c7c5a8d1c9e1a7fad366fa753287dfdffab46dc8b202d1c3233204d263392bb40a2089e6e54b24a301a2', 'Secp256k1', '3d7462832911186281337e213b95dca5dae51142202121bb93c12965a45b4de854a651e89b35e1d0275734c9037125aaf27773662929dbe05b80c71f9b4b2094bb0e55e12b241b900866524fec97a7996e6113a3ee464e3ded452b3349d77d7963c803c94f5787f4');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('f9321a494b98982a50cde7e750eabd9791b37c99384f122d359c68e898ffbded', 'Ed25519', 'b7e39f28ef81b2857f8493c77e4f2eabca3e23ab0db88d563f65473a2e827e27fe49b56b1c2d372155b93b1f8c38a80f163a8b7df57fe49a75c53fa18a98ab257ddaea8e9836a69e3f2de0e5ec2662feee5118d0b62f581ae4f8e68537185886a3c074c76dc9981d6628ed90948e3104cd0cf36cd76d30230286ac0f071758f81c9cbfa691fe17d6610c69eb9db448a9d5b168093d85b33fc9eae6b7fff7ca36b08c83a084e54d76');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0440a3edec558cc77371595489c52c7bbf06bec937862042466051653443cd7efac0daa9a2992cb5b03e33f7752413a66bf6f34c0e29fd3a716b135c7aaf3193d9', 'Secp256k1', 'ade32b746d8aa8b4d3e658347161dc0da2bb3da1225f3212eac8c42736fca78bad58ba1fe2de82112f4c87b10e32473bebf837cdc8357bfe09371a8e82844736bbce36502851441a89e352eff72f6217270fb3ba96382852825030275b3cfc0188ec6f78fc2e99b9');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0ed0ccc4ee2e153c713b46b035616c4c1c008090fea879de360a6ce31f430083', 'Ed25519', '4719957067ec8b9af138071c18eadb4c2adfc6be71b865595f60c32b66eb0ac85a80373ccacd054930f7aca0658ed93f158434d5f611bc830484fa02832321f1ea5d9f30425d2522f18f3b57a45e0b787a5f5130b360eb7aa5d1ca44dcf53e2525f6a36797fed415276b58cf34330a05e56f57599da859647046cba1cfba9adca1e8e46217ff3ba2bebf59b5b6cd84bc68ffcaa57f3188fcb173482c53f4f19401a19093cee574f3');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('164c913122f897e1af1b56d70d5d55b44f4d8c89bf1e28b476370cbebec84f6c', 'Ed25519', '4a0c5dfe035a700263aaf081cf634a3c82a2c6a50ca1eae8d4cc129fafd437479a6581100a317ff66ac58bd905fc0a4340f98168bdebae97a3b6cf5c87eb3e55050fbe73e86bf09b9119ee33731a2fb11b507acbabaaf7d4d64457acbecb91be49077929292e2125a06eb73ce29f85e4e90eef4080f010947ff857b916fe9098ed6e17eb59d10d52c2cd429fb8fce69e601d07fd016859ddb54b0e930dcec41933c2431c95cc6b46');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('049beed137ad630dd6bd525db9f51be1d28f08dc61e97cb3338e5ecc2e827d3eeb974384a64ed84c2292cae0b1afde0fb12b6464d9954523a823be29f57c081f81', 'Secp256k1', 'fb234374164bee64127f86496bd1e816678718ff2495c8715f6884056c523a67ae0684106de98604168be2d4108825e7a113e510251cd3fd298f6a5a85849b7a847deadc7780188cc2770a494803dd636bd4d28bccd35176c658c1891fec2680483d95eb3a98264c');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('5a3d9600fd9e604252433c8c908d2d4bf208c44d394b4cc049459065c7e77c9f', 'Ed25519', '539fbba6f627ecdf83762e5bf0435f7fc0de532cb0fc08f8499b849337ae291d3d8e3350437cc93336908f6b872bf034aafa17b77400bc4be72624134a8529f66f2bc5c10ce77c007dc751abd9c02140c40fa25e8b4e40ed22c9fbe9b1045aa8f76339ed8376fd03ae101e5f57e80eaf1db70a174dcea1037bae7fbf45eeeb2859b3874655c6589471ec57d28b74118b2869b5ca8ca20fbbee815e53cde74beee44627d313978106');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('e315972e9d783d319bcc05823c80d5bea7dd2d70953eeab93bda2be23c615281', 'Ed25519', '7ccb036d3a435f814fedd90e698014a568813c8655fb8fde0c24154ef1da0fbc29a050485bdd90b96588799193039a07896ecf1191ee6731c72cff0c0da723137bb17afe7a88b820bc34c06b2c059234b5342d75b3f69d02468baac6d576920a48224fa5bf33d6c24c5d08bb35fbb227061d85ff4dac2de43dd38f1c75594830b362686112e46d441f12b9d0ef087a8c4460159265b5f8b660bca78a920e2c9f0bb942e9b649fcb4');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04dcd36642bdc212e69c13e86d5d62d71ce74d60f6933f0b9c6cefb98618f9c453a25282b0257c8a4eb545b8b62ebd0e150938943c289b14e4ac286192b6e602d2', 'Secp256k1', '598b601c2538a0a07c094dc6401df38f78c6707f39489a1b2c6d99c968fd4cd283403eee3c7f5b3511b4907fe6e1b27b86101150f3319435853afe55fade2b396a09f098087b7288e988acc784f59ef36f85a170475b7bab66c5f1b79ad1837fb16f48a66767969a');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('2c3898a7eab728b0e01c1f6bca5b31876a62dea45920ec8733822331c9b55972', 'Ed25519', '3005e014c26c838cb83b3f1389724c667d88b27336e3c4eb6a394030428c11b406ac4ff3622be23475130de36a8738bb6dbd77c537d6942c5e4caea819d73f1635d5f00cca989f217f23183f5e7f558d07702d51974f50620600ad218e5d3bfeb711ecac68e78561476bd22639d4c95a932dbc1633bb3ca2265870abf16fe92108836d6b770d0109f6b8df158339d6d12ad42dc9483f75cff8ca106e89cb85ae33d057689079bdcc');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('62818f4484407b2b836d07f7c8d3c4e3fb6a30a3a4fdeaddbe46e78a77e53539', 'Ed25519', '852f336fa7880029bcdddb5b885e465f7389888933f6de1d04d64018ec27a6881e5ce2ae8e5a5014411f1744eae1fb41692fda21a02e77ac34dc9957bd3098df005c5cc1d2a8e3bcbad0e6ef2f5869dbd54db47f6e56a959816618e94957f2d970e3eb7cb26c40ede52d7b4b8ac558265ab2fec4600d9cdfb35ea7853c93887c34871146bb738cac3104379bbed16dc3c9a901494d16637408fae9d1d858c308b0955f0e39f49c69');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04d3fc51ea10db478f87369428e99d8ed18d748a57b940e0c8a173369e21e1b4699cfe70202f0e767298b76ab7840d0a6169da15cfae3d39475b27eb081f168e49', 'Secp256k1', '5b119d2c0fd89db54e1fac81487f6e5e4b2222e7dbc1e82e78ff0947892592337dda8260221a906b97ede3d90128a53eccac4ca23559f5d44256c764bf3abd14f85ab81649dde70901a91df8fdef636b2caf71e41df7f8803e2bdcc4a27cb438473bdebed1e0b740');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('127d9fbdf68ad0dd6343c7e3fff64a60559f77b4d2b2ac38674d44f26697816d', 'Ed25519', 'bb0f8c955916cbc0da5655ccbd9cfffe9eef217230983e2d2fb0ed4056c8f939e45a3c338f2b67bc792508325404c973f1382249ec855a2720f21cc0b6fc101df3286fcdb12bee3faadd57571fde2b51b479f184e36dc6a19afabaa2f86df5317f4a4149d0f2eb981b00c452cc8b8e0753d378e18123f1fd50d0f5d6824b3af68913d082ca49f3085c80ad31679ffe4748ec849158391d2e90da8de8598dd8af955bc73d9ee1d67a');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04757c68343137e4216e4268626edba7a5da613297bdf1ff95e43eb9aec027d619b3f8975b5d8aa681096603f2c30198cf5e5edb70b3fed11ee39110b7e434e53d', 'Secp256k1', 'fd0ec57a3f0dd8f1e3ca874c83470735a9be656d239b16db97654bf87bd3c4f39693928790e2ad1fcbe95ce6b4d8b19166de794d87fd7c8b1f32d9647d28f3cafc67dd3681332890f2ce9275af3f7be8e178a1a6e03d5cfb2738b41ead842385bc6271177c13ba61');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0431166a2525205490eabcd05c9bb7b687b44d229e8e40dc477b07bc92f58c188d6347711081ab85b54c7dfcf23826a4e3edb1ac04a43925b1a6f21c74e0be89f1', 'Secp256k1', '662911f906ceb6d89efe3e31ea080bb0624f3df24ceed794de20e5d4fa24806863a1500dc2c67c6aa943fd8d8cc9f815ee0ce9d8bcc9c76ddc6c8b25065253d24ea29648eeb2b9aebc9ce23cb39b6f45eb4396705cb736858aac31bafecd707ce5cee02d533167b3');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('865be07a3f4f49fa289d8854aeeaadab5826f0bc012c1111d53aae24dfb6ec60', 'Ed25519', 'd05b2a4ead98af2defc12a3e58a98b14838589478f8d75d705429f050145a8356362054f4595acea164ab904aadc6df0ef009d0e8588281b7e16aa435221ad80ea0087e730833e3de19d6d12c4da6c04102c9b9e613fdbcbbde9abee766801716249ee5346ebc47c3bf2660e14ff5926f6d4cf7dcbf178eef78399e2087598823087442dbb711f59a83fd06f5399347d23969eace77e84b8fcf0c288235130abf18917fc2d71d80b');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('c022b16fea0c2f975c14968650a0b9f54979e270cbdcf9d200c5c1a1c7a4af18', 'Ed25519', '91c6f4af1c469ef9ce2400c954cedf34977df2745aa00b11a536d6eacb481f7b7156b6cebd7b5807ba30cb0279ae463e553f473b492c9fa779f26adfd5a6aac62117c2e31b730decd32df09aee1120bd942e7e0ce67af4a9a0e63c8ebb2c210b2da96ff1301183bd69a1fcfe41f0f17e8bf76705c0ec5a0934bcec903a53dbb6421743acc4cae44417f4858b3d2a2d743577269843a2db175440630eede0c331dfd72f3736f63931');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('044e67482faf51383347b8570a2d2f096c97328393a1969bcbbc8dae6d8dc9cd0437273fa5981f0162adbb54f4bed4d1567ed8a3408dc74046fcd5ef4975ff59f5', 'Secp256k1', '5a6bb8fd95db8997cd64795778f58367704c0a00ae171402b35bbb3dc0f48325f5f3069f6c6937e5f24540f4e953a2fba60ed8721bf613badc09b0e7100f5c1f7c121f560127fde99ded86ea560eae21e39136032211f7a441bac9de7604e5aa27cdc2571406307e');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('049c40ad9e7e4cae9feb7f33d881b58961fed0bd3eff54db1ebf7f7fb69e3fecf54359bc518569dc178cbb0734a9538cccf90f021b8c2c609933b2f1417d114ab8', 'Secp256k1', '3e280d26d3100404818af0351a5eeabb124f52d5c65cb93fe1eaca9ba1e00f9b610e4022e73474f3bd5ce453923c889e9c8c3c19be46699da73e2ec82011680bd0824e73c5fc054d92445047a535cb72777d6f51c0b2cfb5f262cf2e76c02bfcc1cc8077c9ea8a00');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04925bdbb504118b58acd5708daa429017757a38547139d25c71c38dcce80fa765c60899c1e55a9ead8e713479c4b4d66fbf2e64623f4048dc912513c052628287', 'Secp256k1', 'a17e99917648fcebd701e9051f0e80b5227d4bf29425781c1b0f6ad4ed026d35b7366b9ba0f74342ec4ec4fd3327cc7cd1efaad6c5f3f027c1b7acd151e8bdcd73f9eac0ca615002a7a68cdec53719a9e53e8a627c552f3b99c123e211b0ce59c2c3773ed960f4e9');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('4feb458d4bfaddf2472b69a546dbb38bf98d806e429a8ca9aafe51a8a4b9ef00', 'Ed25519', '82ffc4072422144d2e1e15ff33422f5096554593ffa9bac950a3844971d641ecf20faf6dbd2ead7375de16b9c9222aea239831700f86825604ba53f373d85b18a5942e252e79fa338866a1ae7d9426795015f585162495e7ec8c09142b12b237381073993df19509e1d4cbd1ba56d9b48ad980b96ae3cc7c1eb5db452c4b49cc5ddcc767e8fb1e101a36462057e01cd5d5e6e3b5279ef90bbe6c6603fbb4d6a8cee0d312237b5941');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0a81e8db319138a0b05492613fdd59aba5e485d9d4e5f2c8e20a4b88b2ff4be4', 'Ed25519', '6594dbfd6e6e36050fba4fc36248017f8e89e36a74c98c912af2eb86ad4a5a949e59e4fcdc8a6793b1ef8e92675661c6b4145c830b6598fe31579805d5acdca278b453a443944f042b94bc91e9a8b6aab0b21b35e879d928d9316f5067f5a8ad6d396aa54e92da146b265a514699bb852c2e17870ef3a6bed20d7d855201b4590107a5f4d9636333341fc70f58bbc9d7b7b4976913a3dd254ce0d76b15b1e3d0fd48352e1a9331ca');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('595c856060cad66616a9b400ad4da889c8b8281d10ed453ec6e6e29e31100b72', 'Ed25519', 'aaa51518042adf3e197a2ac1d4069b2c85bc3496cfbd27db28a96f95fa2b193ddbd5e2950200c1c3f36a7a1fd833f9674264720c27da95e9422bc5b36c7c0445a6aec00c1bf2541c0caa52c05a531a1f2a84b18727c7489b9a49176d13d7b169748eed74bb62c0fe29c971b1430398c2f330d0097133c02c530e51a0653288213a47729de44f6b13bfc8a3c3f3ec4b001cac48c3d6da361273d73978f9277feeb5b20c6129875833');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('2d8d59793817774981ed79eb3d2a891967d112afc5d4e19bde52fdeb8b8be680', 'Ed25519', 'c3579ef097a410578c0d99569e4e082b91cc28c534a80584f9a595be418d9ddf7dcbc5814271f47ebe43685c1c4dd08529a9915ba041b075409dc0c1e5bc190a9740a602a5122921a6e5c65b40ecbf5083b5ed6a12594a6d846b4a0f0e9b92d4f17ba518b49a14b62314a4f55672623e127b90f7d3785c06080dcb30adbd803e4f11226ae8ef72349874e9ae390eb1e85182bacea57c7279ede8c4b9491109e2d52321513a246eeb');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0498ad0a233249b4c432e61e29cd635a20a96f894a5aae57a1f0a0a4c06153aae61e4ed7717216c98826a221023aa56f7b019eeb520aa2f50767c214d0d7a47be7', 'Secp256k1', 'fcaa920b02cb2fd726d7126fe75b69b9868d373312ba2d8cbb42b406e8658f0c1649a8eca98515af330874f90f9589d27c0a9af09d54794803ceea561771e0ccd230ad991b53ce10b38bca1265be2ced7c9997d8a1ab109ce8ce9a15e8e4db82a922bbe64b1a3264');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('df9229453c8d3a6bee43cf0b73148d5d2d2bd410f88951fb99c3458fa095ee6b', 'Ed25519', '7e632bb573fd14442670a3689c55ca7e693fb57636b0c5a2f54e9ff1e1c95a8e59c002507a7df762dc173094ef61c39c0fe63a42b33c3b24a77e5319062792ef2d17d6fa97003e19d42b00106c1d959aeb1a12b47cdd0572aec723ca419dea3cb874ac1185aec4b905da9a52b06ec3bb87a42595d2a92f7dfbe32a80ff0080fbb7f3b23a0424f2ccddfee113dd677a1e9b3ca4fa1a8315080807b989e36e241a5bda4a68388a4033');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04a38c02368ae890ce16bd035f821baf0589f7e9605c6c0f01b025d2ecd0e8ea0c1addb1dbb326c3bf17ef751414e2f9660e22fe9133e935a564e733938a21c584', 'Secp256k1', 'cf4bc3119eb9b802fce94cec1eec5695ce636a7369161d0bea08b3939f26ba30d821a14c0c94992240d88a56f77710dfe77d081e1ee6e57f057385c007eb6b583d84c19d5482c253071b120d2b3a2516c49e76efd7b74ce2078bee1d8e874be4999087ebfdf74583');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04aba4b7e19c69b2c24b6543b3c7025b30c82a3152de229a0ff159a0a854d9962a224144713cb5ad44e2c4fd78f1f4debab0e8d5d2f5bf933438572ca667d5b827', 'Secp256k1', 'b8b448d6bb07f8a9bae04110cac9ab38d78e6bd9dc8ed3ace34a3ac520c19fb197125e3edb39bc8cc12acf1ae171a415993d8a18b3b1e228e3ef50df3b8a3c5df4223e42295441104398259e8c6a4f2b89648d8d15555d1987c273e353f1687a00b2c384046d624f');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('b26cbed7a31d36b8fc79a1473d05d267ad06aa2dd4a393187707cc77bed1062a', 'Ed25519', '93ddb7810d04ad2cb3e9aa5d7724e7bd7f9c713dafafc5247617951a91b23879539f4f9053ef016cc9818e4aa1593c3617d325724f73e010b46067b3ab22ce659c268d06cb0f87dfa31baf23c21773d251c718c9699af7073a4918c72339e22bc7c6a86528f10a54d78225b70fb6ed6930345c40dddb267f1d7a2ccacba1fe7ada27eb4a3acf273da98c77e1af6ac5ff0e1038fa804edeaab511647887f9c9b7b98fe63c49a155d5');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('20a651a85b41986019049e1719a907783bfdcb18e4f3acfaa59a4affc01f69b4', 'Ed25519', 'aae28c7df00ddb12e9f8c02eff8c502490f67ce535ee89750d0ceccb893d2dd14bcf3c6855e2a8d770e85c6a45c7619886c1bc78f73acc0082564462e928f8915ec9046809fc72118ab27bfb26790b986998afa10fc683daa6e783d3c9dea8541d55d6ba983828ccc1f2c1768c3e73c6698e3dc58b5fda6200d702baf3ba696093c463c72515d14f744a4a0d2ad0153524967238c41df881451b80e5e0a2faeb73ad6540ea47eb52');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('44b7187bf2b81e6704c42c1e9e3496ca687139c77d2fcfa4e5a707eef126155a', 'Ed25519', '7ee73dcee83812b43c79f6b2c3267eb837c75beab508ca59734253888ee4aa8f08ba0cee7319ff8142ba351e47584432ac91f31a11409eef6a508eed444f722e4f9dce0e71279240235a54eda9717a73f17923cd77cf34746f3c28f37b1b1d31146e836788497f5ecfe4217001aba79ef2236ac3add2d6fe92b584fbf1b667aa27d6492539345565d7c93bcfcba50eca3dcab1ef71391bf801234aee8f6b73ad1472540ae7ba6739');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('c034e0bff7146159ebdaaa7875c66c57c180ae02d70f9a61bb8ab221ea779d2d', 'Ed25519', '9e287ecdbd790b91b70053bd1bb929fea49ff970f498170a32493e19bfbc43640b1bb39206b1f5fd8f9ecb3e51170854f6f0dd3b32613888439802e266ee826258048490279edb9542881971b619aa945a0021e5a4b5c12257a7710830d964059877f7f63a7f87c9f06d60249b1b8f5d4dce4e2124312ec94230d3c7a80e83fa5659d2cc8c32b9eb3e90aa97963d2d828fb8ec1f505d26d598d8d82643af40be70bde25106a69196');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('3fba6d88f96a6452d932a19c423f2d0d86a43a548dd3693c1d9156d203fa8610', 'Ed25519', 'd0dbfcb01b38063ee232065b73b1a9d2c0c2061dc9300292c09be78f5208310f2930d21547ef5396f377aa4d8d6a07fb7feaa7f8caec0f045a80d41532fb209664d30502c7c5d9d095ac670f7e554c5ab1f29550c470d428394f40982638cb0a5d01abee237ecf222b34d0d8673180c10e6da01046320c30c5868468823d125180938517f5e9a2db54853022ba7fd332690c4551640cf3cc27e707f3bfe9f5adbb99eedbf14b18cb');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('4c96674e36df5a7655df416e956448629c112f15965832e9094e284ff6efc6e0', 'Ed25519', 'ceb728f62e08387ae1a79b1e631df40666d087bec18729f90d619c6662eaa0c51e64e01712bdcf6862ed4dfb905c215f56fdf7e52262e7265ecc441bb8558901ca2409b4548b6cd94d1618e932ae8afebd7e2c4f55ea7984b340e2b487a1c70434b9d11385b3d0fc70c378ef51d4f4770f549dba526eca713a6c127ab6ae3afeeecf89ae43a2ecd2a3138cc766aba66d7c2dee5ef3875abdc7627c2798a8d95880fe392bd6dea1a0');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('90731085833bc837ea1dce9f1fd4cd2bd237c5dc2560df97cf24898d1833a2be', 'Ed25519', '4659fa943ceed68224d8ce9e4df5591c0c8d8f336432bccecbd28b880b88ad42b5a2dc4b630724fa5c8573558df4fe3634b21c22796ab0bc92dbdae87eaa0d961bebe7b7728fd0caf18004a6a38abddf4e9f0f6f47444dbd97b169d7634122f5e6889d423b1d1febfdf96bc9b503c521f8806349b2462a6410e79500ec597d3f740dba56dc5441a98a70956c2a10e8d9ef5c85390259cc22d93a726338ea31df618e849d57e369cb');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0db8c5764686ba96f667afd2d7b28f1fc29e611af56511072673cedf89634090', 'Ed25519', '8d6a2a8dbff35e0c90c0ce10a39414ddff3a2645367bad6a0bb04a8080463a7fa85c2107a767a8ad3ea860911bb2c7a555f37fd246105109ed5cb983decce6b0b93e0d0d716c51b1a722bafc713d2d94cdb4c3076b7ab41bfc23de1c27297986c611e45224846278582536526d1240155f22a0def70f88355ceaa361527c279d69fee4bd4f04d6808dd76d55ae6191103520ae053228033359e521efa80d8c17b3f9ab0ffc20f5ac');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('5480fcafe42916cc6ce7464b676a66d1803de4ac702b5733e2c93e1d892e3a6d', 'Ed25519', '3ec44917fe2e70a61f899e7863d4d719768fb828cf9721daafe129e619a8c9e2eb91fc046f6e251e32a6b23a31087bcb4e95caeb0546900a86f0b2f5e0852a5eee95daeb794b80343e36c58b767522755f75b3b89cdcd651abe7ccbb1b8c835c4d98391779e031e8fee935f6c05617d35043adff3692ce90bb43588e046825f46842fa3c7dc52a0eef1deac4098a358f61f8dcc472bcfc9c48b9f78c5c4d7ffc34470849248600fb');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('4a34dfd7a4921dc133c56471a5c3d8d32b1ed94f9fe3af08b168f9478dd4bd50', 'Ed25519', '7a9a852ce72bf3970967f85a96d66ae5236794bf5e6c2eb89bd6f2203ab3b6e78f5ce581f4482cd8666975225e7d5759a66a6d9ace155f7b4d3e7e45d285896338b0c630dcbe743793e56c035d4fe434235f1725f5ca26bc83b2e2fd9dcd14ef0da3944a44d22e9ad256d15a43c47861fdb218304f88db04e5edad90abf3b3206c283056ac60ece00282107767e09a8447ff078fa46933ec246655b664099307e6993cbca1346b1d');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('99bb591c96e45356d72ea0a04a11e1cc03c62b984b8adee645ffe61adf932ef5', 'Ed25519', 'c43870b85f545cdc0ccf051381a544c9cfd82f31a9ff7163a479a8a8652ecb53fae01824a5eaaaaa1a461c436cf66d44ecb977c5e7c98ded1568d2fd748af1ccb9f7d497ebf6551666b39f7dcff6ad062d9ce4c595acd15449020aa8e3a44eec6c5fe623c0170af2a882e5b6da8ba048c1ea6bd26c27fabfe326db5c19ae59e45c69c4d51133c4069822c87906103b0d254dd4ae81ad893c6af25f50daa23bcafece5c12a5e0428f');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('5bdf6cecc2b781ed8fffa1e65f424a49f9cb4bff419ce27a72dc1ef3b9ccb4e0', 'Ed25519', '1f605c6380540d7ecff7b2a12e87d8a11de0ee675b0d00c36e2d3ba993946b96542f40ce48f2a999dd49eabf46a63a306c52a56c8423169adf89388b298135284993228ab12130f845e44f74136996ed0a183dc605b8c7bc6d1e358c942dd1b5c9b7e2953ba657c07005ffb67565792b10632e621f9c99c1795691e94bf7f4c4f8585257a8d7a76c573704344609040317d9bd5244e04d6a8b5616ffe6a39528557029d752ec81be');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04ddbdf1d89c8a02b4d1661d01e337656a9de93b2c3021981f568b754965008cde305126782bd40c15abf1d77226b0500a4ad757c923752e5996c41490a38b3660', 'Secp256k1', 'cce67315ca368c7f21ba399e94dcb24c52e2718e1413bae255506b9c2db2cd17e8dda96e3c0d0f5e383cbf2d8fe015f8f4cb0e790b5313fba829356d072a2364de182d2ca60e8c0b914b3a7c4ca0b551f9d5c4ec9745ddcd6c609392627ded142e61defa37015e25');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('6535953482fef27c0569ddf3b11adae500538c3c9b91f04ce23428f0f60a254b', 'Ed25519', '4413cc84afa8ec58c10abb719032a760e5d6ac80bdc82c62610d2ef46857f411147d13ee3d3af8adca17d60e6c6077ef4b3274d63d2a6d69c7061f3bf6abbe617ab9cdda3196e6cd88ada9f80c98b00a4f5e5ce6742380aa1c35c82cd74bd8e65dc4b0ee544450b2012999f3ff3e83f82173beeccee838011a5f6ed5d89a83e30f03f86fb18f598799a214d02bc5a0d760b9c86ef6e1d0d6cef280650a0abda06343acedba9001f5');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('a5ed01da0191866ab3a967fb2721d40fd20ceb64b5f878febf4a40b1ee2e7f81', 'Ed25519', 'cb4bb9eec45dc6a525be17ff760b6881f90f32d2b3ddb6414be3bd3465c511c1ecb92aee91fec5bb553dacc29d01813b0d9437a2349075aab2133388309707eb6bc35a347397de8cdb06f3744ad7f6a383b8b7ed467592d7f3f9877350f69ec105eae8173bee4280ad24f346759de43f1e4f93018810b194cca8dde73466abac02ecb5f429cb6d0f2dd2ae303dff4258882599a685cbeeaa3868cf9b6b12451ba6d5d6cccadb0dd4');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('048ea1ebb81e422338644cc0bcd49b0e1d41ff548dc3feb37b49fec98cce9e67182c7b5018944b15cb1f630fe4090759a403a01b4bcf1dd0e475d0feccd998bc6d', 'Secp256k1', '4870f7965858a803ef5a14ba19c47e40550ed20bf14a5f124292df5e9ca43a54c8f2ea5fdfac162b5656e1308b0171ee48ac2a6b6c5c293188b26debd8787393738d9910fc76d9c803b6b86cfb6107aa01001056b9c44180c2e3e1d880286993da3f33124a54a295');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04f873625c463d98d8b572d4fd2e78a5b1d422e129e7b9d8e23b56c7521f8b1c88de30ad65df3cc7d54d5f6ba138d7320c9266e1ea5f3403cd4c2b85d044b79aa0', 'Secp256k1', '9a6dfe0e21e9e87796c8b47c2ce098eb4b356a2f761c3c37ce7c48bbafefc92aaba6c17a45acac877bef33f7684c0bb0f8790a655bf05494fd1511d227713f74eb48da64344262a2083f455d90168e327787fd857768507fbe5c087a021b99dbb4a70d5f625397b3');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('0efd899838a95188472cea8dcb735651faf84d2bd59ba9d1038f274ecace4318', 'Ed25519', '3ce5c64a1dc0c0e82a57b79d50a73a7bf42a9f501d030124b847cdb03f48584531e9d665cf5d09f43b556c51f717b00aedcc7e96b48972241542703b49365af601edbc081364d782806a43ea13fb3df797cfe887c4d9d3f27a5d205b6309463b8404a31898f931689a2cf66a60d43c3e8ffaa29ebf2b6d629a2f740b008730900151d44f745529c86c19c0e6ca5a3f9cef39c9540e5a41f61aec0e2229ca2402862eedf39b9c3a33');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('3d8bfbceb0ab85f880b7ac597ac2d74cc37dbebf2a4b9b61e7bcd4152553ce39', 'Ed25519', '9d3a2512ebe52403599dc01e63ad790ea9d38e8813e90c07df5480ef1cf5e05f78df2ea1aa4744e95df1edaa0984f9a44c8f24b98449d0ed4aaacb4573abaddd0f9cce144bb27aba87a3fb7de3ae6c727c22a84f2d21f4ca56cf692d73f0d35d2446e0950a9d3d709dde0000d0d05a20f3d904ec3d8d7b7c0cd35aaa2a4a806cd0b48100b17d0fc37834b39cf66f509a38af892073377291760299d3aeb6f8cac2ce48ad63f3265d');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('046025baf96995e2395882052069a7e5fe369b27d1abe2c94e6b3a2ff9e02abf45793bae6cba419d41a2d875ab9bc161a8afd98a9420dc49aff49f49464c41cfd8', 'Secp256k1', 'fab5947887c66e8fc31cc571ee606a5b958379fda72d7e438b572773ea83971e5472b3e6a57acb6d73d14ad2794130c62bf0f337b5f6274bef41716de6e7acb9d29bf46c4bfeccbeb59a69427f735d244281c0116c1f929aa4f4648bf5ee45bc1d008a1fa622dd32');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04c519047b10d49f38a2113066087e95221b59659f6e91d5ea9be91ec58d80aefffb9682deb4bf0b005a0bd0953ca3013f3dedd8e7f73ab2a7e21733bcb68aa766', 'Secp256k1', '97b3cd7eafab209e1cf785c5640f508c0b241b93f8fe3cd20d83c144fdf94b59c42a72e89ea96e57c31a108bbdac7111e62be7d03f427929f3b14957855573fffef141160151fad502b7f834c7be8b9fe85474f7f48e14bd6c5108ea1c069defdd8b23704ac8d38b');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('053962683659f39d83f590226c80bec4a4c29ddbf8464321518223847067b93f', 'Ed25519', '6afa8aeb9c2a8eb7de942fc18aa9ea71b06e7d26505354d15200abd238f1f481a28d41008393f2f07431ec08aa09b79fb2ab5e774c6f98ff8475bacd7daf3f7c51a4114641d7cfe7700027bd284cc4432c842097e1f5d2d43b67698760365a33fd3053092016f6fe37033f5f319f41f06bbbc8a35abee677dec53e46accbeca5877a76f638164bb7cd0ff6cbf8fd4d29dc8f49305227e14fe640a29ff0869a92c702a962f64ec19e');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('3d743e2960430c15cd96a423dd71bcb6c7a95a2ca4c35faa4e8655b9c62807ed', 'Ed25519', 'e6d35e9ddd3cd22a08e2fa893bf73706c73d5577f4e928eae5bc11299224448779ab4eca7708f1b3e7a087c16e2a8b0ebf4aa57767be3ae65770cf6c9fc26b6ee099d160ebb0ed4cfa3ccba46e100d524a5c7adb0de635e1ba4a045aeb9beca1765bfeb8ea80ed152c14a46b9142c4f0530ab91e494c745b549d2720ed3363b327e13d55eafb9cc40151a3acebdeae90d65b332937094e1ffd01a6bf0484cf5c41ccf85bd66cbee4');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('54bda69d8f011c350c22bb44247c0fc4f16798db1139ccdf4f30e4ff10e3bb7d', 'Ed25519', '5ae47a3cc0db64b062826ea5eb35c78896f96d7a079bd041687e4b88cc8b9142a7cde1233fdf01d08996a127febd4b4ed433b3e77d83d773bb4da5d5b7f25741230865841887779f52a0d0c90ed048d7814c752010e8d489f60936a0d3933c9183082f312802dfb7897b1f440a0233074076e44bd0b35e74eebe23fae964be92687c007408c6e2e618ac90ba1e26fdd7f9b2a284be5aaca98e9d51dc1eddf1f9c6484ad9b03496c5');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('d149cfbfba19ac1eb0ee7e4885596a0c11000020839c67f1d181a2fcdf252d34', 'Ed25519', '1ee531ceffa3f9060e874ac64f90f69a49961c29150a38aa3355e3b5241e69ce7b9621cf2efb1355885125a4e3b7e9195f2e69915776ad049dc10892a4a7df4375f241b73036e5aac100f1b668304ada19bd51f4d1979bbcaeb00474ddac5acdc2e1ef0eb591a1df5ed3469a74d73a9ec7d3f59d91f7987c82b02bfc266b65d6cb605735d6165256cf8b77836b37e4367c7faf34ae5a5d7c350be27084efdc0e5e9c27aabd523f54');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('9a6c1bddde79a50e9861a009b0cf02d146df43b3f9cf622ad4a2f473dd012d7d', 'Ed25519', 'f5688d3c866c494fa1b9c6b701ef30911c1b739e1d8dace083301c4f661dd7d6cccbe42ca8de955fa367034ca0b241753fbb344c532fe5b638b0ef82410eba44564537b4a03872bce3a273296b569b7491cce54e46011a508e68fbf3edc5eaad6171f2efe976110b29b806d8c753e086cf81c6b6ed1526e149b323800885a1daca8ff77f7f5ae7feeec88e3bf652077cec39465dfbcf299946bc5550571ede3f79ede7a104216da6');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('8660beb65fc803d0bdec1272d84abc9f226b79656e946f9f72501720803991e8', 'Ed25519', '34d2c032d49f64a5ebcd6069746866b1332346d88c43bd1f196bd68e7065aa8d7119e9a4b8f258bbc4b25e62174abc1fc65365f4105d422e5cdcc6ff7eb6de8b7dffab8c7d0d87cc773f558436d5efdd6197cf6aa32691e74ca406a58aca48b7e8e6048e9d6e20a9f91597672987e9a03594486014305b9f10f1eecc476c118943589b9e40317b658a6bdd3d4d8e64b85453507013d565c09cc7b697a0c951b91d1682b70b233a50');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('be44d08c81c64519279aa9c201efa5cf58f47cb04d1455fa780946a8d7e09bab', 'Ed25519', '1cdd7a8d791eb0c4dc4c019c0a08079ae8b23738896e986159f401f1e106c21d8a7e8154ab0c2deed65a006ba3c7f638db7e6c42b840fe64611e3adf7a6ab4d673b1dbc6d9cd83a143e757b171d3f3ba5e1dbc8c0d82b218d057a0a34a41da91228a996cef69571735085bba5988d1030114dfed44a0cff133097245ce3e5baa4bd9580c47970e6db39abbfe2c8abf2ecab4fc96a2a009e16b47072ebee52f494c3bb71d6d287ac4');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('b9e75dad0e18858744cb9a4f132065444ea81040d41e281009b1ef161f825ded', 'Ed25519', '97e443ec6f730dd95b1d33d217d738d16f4aa38300968a7e0f32960a4b4b60096ec949681815154df479004a38b6bee85f8ee6de99acca7d393b1bfce9582bc5bf793577c744375029dad019c095b6bce3f2ca325f754ed673dfbfcc7bd58f06c0afe2e2207d7720ebf7dc96a39b31cb334efb866361e1af73e117653f1c06d86d255ef2f79e37e1ab020462f5528f21d7200b4e014ca01b086587331357bc3e63be53dafe0f594e');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('53bdfb9bd9618672e572bd06917bf786f42a35d31986f2e04529be4fd1e69f3a', 'Ed25519', 'fce4d8cc1d4faf104576b7fb92d61e05d9f33b71e36190ee5c7ba177b3cd6d9af9565cf54833c011092c1378abc228a0ffec7905a619dc4517af75203b417fb594b5b845cce5ee0ba0868000e8d0c3106d235c019a4a5ed09aa68d0646634d0d4fc604769d4dee47d64f0805ad2b28accc0040066c8d1cb40a1829dacfad52a67842b81cd147d3539adabf884902005f06440502ed61542d48b7e0295027434b6fe2fac3894ce1cc');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('c1243cd7d87a03adefad18e09914c7cfcaf3ce84132d9c07570f9d5b71aba771', 'Ed25519', '2aa64b003222cfe1468b85021a9c4426f94187f21ecae52a7333e329b74ae066a503319b698bd2a2541f7a592fcbac33222ac268cf30ce2f70404ac8af98c90bc1e9f38b9689ed6286cf60b839a8ae7af1217f5994b5d1572c45099b9c22657e8ea271f1a1562db4744d5731e559361abc8fa894a87ccdee7a61683092152f8f5d835de0f48e1c2c4a6712cc9722b0827b666f3c75a8e292c9690dafeea265fc4b4e1c52dbee1c44');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('b83edc876a031a37dbf36f35e8dee05c4b18e2b305f51dabb21869647ea6cf00', 'Ed25519', 'ac1a4e545b441fd93493ca69fc691cc82ff6bd34f1017093661438943c0689bbc587ba09a01abe3bd2742f08716c68de33e727d5c006ab1b86db606cc5d9b2717a8062a5ac130309dac6c65f7ef831a6e896090c2dc97d4c518f1000801f286d176224904e85bde83c7ff7da663875d9b30d53528b3e2c1052bebc5e65d2d3c6fe48dae991130a8ca1b35994de15e0976143269c9be751bf8f325fef811acb38b713b5e2afbce241');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('519774ec7eb7eb149799b8ee66a4f90bc7de7ce0fb05b45f432494b55d1ec3d2', 'Ed25519', '8bc7984ec13f2de6b71e4d0b111c8d52b1439c9a5cb968e798cabd4f6ede74ed0a38d3b70758391802bf6203cb4e80a6e0f63839ae98bcb69d729e262df5645ec9e9bfa5b67153350fc93c4361eb1931af066ba5da2b83b33c4624a7639e86bd81b0d967de55d1f2b7d959d71d65f918167a76b9eccda1055cfb6c8c0afcadbe37e311ecfbaa305d63889c28d2f204fec756998b3110b08be86cfbd3d2bd6f1a6c65244e7120c7c2');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('dd57367110b44cb79700c06daa54eec92f254344d3845606d934717371740c1e', 'Ed25519', '834b648166ae6912a9ff4415b647755042e4d7d013068cd3c49b62c562ee6de6e80e644d87e508aa5dcaba71907fff80c97ca54f90e55e9c61cc43de2af72a413c2a9f9442df04885570e2b0e659eab7d0814e068ae85609cd31070bba7cc75ea3e7da09834a3f1e097baae53e9da9286b84e5652baf2cc26fd498af975ac6a0da5c8ff03ef0d7e7f31b2e3659566e74dde6ef720448c91bda1e704d327303ced986fc550023e164');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('f38bdd03c3aa34f1f4390fdaff2badd40bebcc2f77a3337f663e991ab39e7396', 'Ed25519', '30da80fd121ffd107e5edca625ffe657e8c22bd8fec876d98939c5cc96c7288beccfb04fe2ccbdd93542a156b5b18bd0df19edc470ed2b07c3d2e36f451730423ad3e197cc8b8b1b3b60c3d16602c44434d727312405f3c626d7b0aba9a6c247408aed02d0a39edf81408c83a1a24daecf073872444eb435bb410e70e907ff8f0949cca063fc1c9ce18a4e539d411964e0e14a9f76d4678f68433a1b73bb499f50150fc9ce5ee9c0');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('041bf6b6912512f13d574709c0b1ac6efb6de5d91bda4363ea1a60da4002be7f31ff2229f5f66a8e52c17e4a3e9a4b14caea7a40c816e3c6e4452b7853ec4154cd', 'Secp256k1', '3b2a1b697aa040d5191181140ecca495e3eca0f42ef787a6fe5854205e28f9a29f67907a53cd0c831a1168438b9f511c7cffc60b174bee857c5702c5034087954687e9fa10321cb3fac314ca5ba0d3732e029e09ed380e44bd478b68bff810fdbfb2153242b98564');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('e398b1a73eafcc9d1536a3b28e2d5be017007c515468b8fe28ade3698d878685', 'Ed25519', '525007cc6d2b59307a435103c879219e5b57a5b6efefffebbaed3cd64260963a3eae99c33038268e35554b85f647f46c5c3a735ae0c93e4857f3bfcdda965c9cdafb2fc6167506454689818ac34eaa16dadd1b265e016ca8251a5f772e308ee9c724bf57023ca7de7c9c0adf7efb2fe2533e553bf4ce7a74d3d1ec50d0b87a7d497d787b71271d66229aebe3f609e81cabbd3d17f0248de2355c9d879d19fdc90e3a7ce5fbeba0df');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('c07e6ad9070a267a2f8368f0f059b13d2a69f6e8384e2171a5dba0985fb038f2', 'Ed25519', '125eb7ead2b376add753c0df1a216c36c8ca0e078b7d7d34732bcb8f7f936a849225a777923b3816cfa90431efe03223f2f5ba9e657fdc3c885c5dd227cf7c7bdb771f0cba827b98122807e7c120b30fa3691e4cfe12f7922419f45f4e221606b11630fd966ace8699286e6d25de00ca5bb400b3987791e2ef75bb6acef1f9c55f6065d91e448356e663434b77572d8563395b96517cde169e5b9ba38d00a89d8127cf4dbfc9e944');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('e316d12b6462925985008be1cbf534a5912100345fad8ea4b07bbcae46edef70', 'Ed25519', 'e54faa958e234cbc9c603e3583825c1fd48a5e65780fd597d10b4ecbb476cefcf7db02cb34858917620f390693a0772a185eb88026d825c03432712706770ec33ff578c5a184b68d9c5946c7f2e9d2baac7d5e12bb663ebd081c4b63148100171f0cf64295a96f6e13edf424df10abef7c8ee50a25ca5d9836c12d69d5fb86bd0d00e63f24be74b79139fa08f22eafdb1c442b3931fc700bb36a3d0dead30083f5964fcecb5cb9e8');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('35d529f44a031ebb5b8add01380960b6f2dd285845c80ba8a5086a39aeb3157a', 'Ed25519', 'ced50844b13de6e908ec583db6b1ee9fdda2aaa5b2e52f4dff53abe8d1bde467bf3a22456733d95e73c555a3e2e02fad81b92ea813b308336c4082438c52289ca520aa009034127d30b8b0d02f193e76c619099eaa1a6ba3d421e1ab2c628354d2d88ac66c46f6122d6e050e7ebe980474c8478d7dd41c50acbfb8482ecb2f8b64b708934d5ee6f773476e74e48bc38e67aad7de440410174e52b2f7faf3d15e12d5178210aa3f2a');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('7f4f03875648766b35f44c2c004b8d1e8790dd86dddf5a97162880fe4cd2b101', 'Ed25519', 'be953f0885fd9e818bc2da414853eead1003118e534cde100fb2c3f74ed3e387f43b967f3a1c6a43e67ba476bed73398e10df2d1e14771cac1175b9ef438eb9dbb8cdcff46e1c55790d418944d50356a18a5a80aae35a9f6197027533aa1f87e847ae6d4814d90fb90fb8ff67b272e363f0a4e01e021befcb1bc1ea6de700f0c9c374b8d8fbfed8973a0412927dcf356ace2fffb30513c50526505f3511d8142e10eec94297057a4');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('94b2f517a5f7296b301d4936713f8e2a52bee54167f6bcfc836c9f76b52b44e5', 'Ed25519', '5c0e96f997b5605d743b7804195ba907e313c30b80709f39c6baaf1bf3a1d63a9a2a470a3e784cc422f67bc3d577656cdb92240e31852d425b223d8a0e9f6355a20ef0bd10ce9d6e7e7deefc4cc7413163f87a3c9b8c65b6fd65b951ea1c5c865e78e021cb692e88a78c5320bdfd96f782423f031791cd1a6c0892c34f1b2dc1ad5ef65c06c2b937f07d691f95dcce75978c269198b0bb474ed9f9c8fc7d75badf6b7afae7a291e3');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('046f8c9e30255d587147601809f1aa18909fc4f99f126060f26ad42e0575c0f0cb39704f4ebed134ffca5dad7c769862b82a02568f8ba8af8833b10be17231d24a', 'Secp256k1', '6fb583249fafc891a1ce9b3590bea1c96a4361050dc978bb1c4cfa23e54f7beb7b2363e8b9776c1e808ada6782ef7a10a9877df34a5adaf797a8072d6f43869483640d0abda10216ddf484c3033882b062468595d21f532b6da50b680f6e0049305e8b17255830d7');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('890b975720d6b61c7731de117341b14bded7ff918ba0c45fc93d4a8ceb8a4956', 'Ed25519', 'd331182d7555ae50a14a0fda80241ad18db42a85bb66858d0f6b10e27fa66be95dfbd63aac238ea3bb76ec814061f49c9cbb1227128031f3152fcce2609e1d2a97b30458688e7eeba38c080a70c1e4f52aeab05b940f4dd4804f56a161e7a5761899dc2f516d54ae959ff3398e2cf52bf6d786c5547b83a33f470a0cdff70ea19b73770105545cbd8788bc659c81ea5603c63a70abfa603fb38c6289ad91a72f6fe03680f9e71384');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('b6e888bbd41053c9df95e3d534d60e52bd097ec8c089076a4fd66c13925dcd81', 'Ed25519', 'e87bc920dcc08dbc036581c78849cd188a4f29b75c437d6ffdefb5bb22f2d4d9d2324d0e2c3db036794d4aaee123f2d0ff44de34caafc4392d4c414d36b8bb41ae27f25a8711e9a696b5d56d60ccad03ef9d63052cccc9ccd407955dfb84637ea4c83398f0b5153699dc7fc27557d71b5e63e5aab51f31640e515b66b37009a391e16583a7fd7f52a979ec4b3af73065c9bd316c3f5954cc5f25647ad7d3bd55cdc305e6bcd7ccd5');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('78cbfa7a0f952580bb9b4df8db9809025dfb6a8eef083c52fe918e520da3431e', 'Ed25519', '2cc73b390e8958b3d2ecb50950be65db4d36e8fb080be33b68f57d7aac2f33c0e7afd268f8ed7cea98f2ff809789a164c6fccf7a913a9fc535b4675c7fcdac5bf8a3d358f1b67c3bf983069690fab6d5bd8bfac9723f6b9b3ead684bf57c22371e0c8b157a88bc872f607ddd25143c86c2100b15a029c89ab2fc6ad35fc04a33a4351e7084d256140be92adbdf32e7c3e5646b685dd33ee3b7ae82b2406765fc3896ced58d284be1');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('f63c3aab6ee25033a8a48a268010c5fbafacdaa5c808ae17aadd0b5dc237b19f', 'Ed25519', '99a03e6b8c1198e765c6894c07fdf05b4c9fe590f116a3150e21ee133da833d721be05b51b4c8ef8860914287db7a8600229916ba091fb78886f48e675497a95813615fb17c083ee541c58cfd21fb6fbb0cdd021f06769056f0871d60b2adc9c2deb308a0a6ea1e5bfa63855a433a2923e1f0ee3cde42c5dfb3e19c08086193b7a733b11e471a56f9e9eec43848cd4d0d44ce091c3a173ded93b728102d7c624a5abecff4b2894fc');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('04c1fbcd77bb048539012cef4cb07f18149fdf783c7a58c40ae6d119c6ba8af8d6114a4d2b75eb74e5cb6aa806603f1cb0a7cff1870344746462ae9c891130dfd0', 'Secp256k1', 'c4ba9a6c2d0fb72c2e16820d0fb6a59ca1ff1fd957f8c555cc83358b847e4f6102321e00815d9475594788d56402b69dae56bb2a7272bab8c94cfffc910d5c66246612703f6f4c8b0f69c6748e393604e3549432591543cac5d11091b686a370a6a62d0360f53813');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('b04dd7eeb929db57c3aa707efc53a86c686a75e851aab855f05b977cd404b2cf', 'Ed25519', '7b2c01a628b1ee416407a2a82c31fba63de782beaac416f3fba4fd284052b9da4b730621b3dc43a952a31b41ae866aa84a4057616eb6459dd9e727a74a21019678f5b98c68a290328950f76a7acddf338e996d1e2e2ecff33ba34927b1a8cba1a68d50d9c70586f89876f913252b08367098d3529e9a4d31220a6db34338246776e32aca558e93ffbdc4f1cff513367f7a6ebae2b462ac40cfd06658ec3fc8b8809c14536b804dde');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('042902fb45ec9b06f0972adc970fb320f845c06a5de5c841d5def7d28fc8241c0b3cf0086e2301a1f7a815902c3addfbf90afd21c07feb0965198b52e7338e178c', 'Secp256k1', '6cbd8f6380df67aeb3d3528cb94ba8c5472343798c72f1b1f5c5b55e62bffc092183b7ea7b639b5435d5ff8613600d693b452fd137836d060c3884a66142619acabf1f9b9a89a4c0081ed68323220fdeede7737f3687994639f927a1b214e04d4dd6a8b7b0765c88');
INSERT INTO public."private-key" (alias, type, "privateKeyHex") VALUES ('79502c0f56ddf87e4b6a7978c34b0a6f8d1c44ee2ee8565d4ba85000e20bf2b6', 'Ed25519', '0538059a9baf1d2c7391f3247e87b51deb64d37868dab04e8ceadbd0d41dbb221b96edb3b79a21f29b3a896795a289fbcdad08c13e8f3cf82de9e991557bbcd9e47eea79ae7255e4717dcbdaf4543ae56532a3179ea39b7118af6ec4754334937053573e1d01361a6d579ea994f1996c858729e11438a955b48e4f573629662fa5f5ed533418cecca71b593e68b8d2cad8852b92e34eb0a8207ee4f0b55f7fb5a269790f7296b423');


--
-- Data for Name: service; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public.service (id, type, "serviceEndpoint", description, "identifierDid") VALUES ('did:cheqd:testnet:d8cfcf08-c3ea-4a2e-aad2-4169078ec523#service-1', 'service-1', '["string"]', NULL, 'did:cheqd:testnet:d8cfcf08-c3ea-4a2e-aad2-4169078ec523');
INSERT INTO public.service (id, type, "serviceEndpoint", description, "identifierDid") VALUES ('did:cheqd:testnet:139119e8-35d3-41df-940d-6e2037504e27#service-1', 'service-1', '["string"]', NULL, 'did:cheqd:testnet:139119e8-35d3-41df-940d-6e2037504e27');
INSERT INTO public.service (id, type, "serviceEndpoint", description, "identifierDid") VALUES ('did:cheqd:testnet:139119e8-35d3-41df-940d-6e2037504e27#service-2', 'service-2', '["https://example.org"]', NULL, 'did:cheqd:testnet:139119e8-35d3-41df-940d-6e2037504e27');
INSERT INTO public.service (id, type, "serviceEndpoint", description, "identifierDid") VALUES ('did:cheqd:testnet:33e08531-306d-4304-a8cf-147ccbf2e047#service-1', 'service-1', '["string"]', NULL, 'did:cheqd:testnet:33e08531-306d-4304-a8cf-147ccbf2e047');
INSERT INTO public.service (id, type, "serviceEndpoint", description, "identifierDid") VALUES ('did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#test', 'test', '["test"]', NULL, 'did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0');
INSERT INTO public.service (id, type, "serviceEndpoint", description, "identifierDid") VALUES ('did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#rand', 'rand', '["https://rand.in"]', NULL, NULL);
INSERT INTO public.service (id, type, "serviceEndpoint", description, "identifierDid") VALUES ('did:cheqd:testnet:46d54210-2a94-4c0d-ad15-ca085bf8b71e#trustRegistryDef', 'TrustRegistryDefinition', '["https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:46d54210-2a94-4c0d-ad15-ca085bf8b71e?resourceName=ExampleToIP&resourceType=TrustRegistryDefinition"]', NULL, 'did:cheqd:testnet:46d54210-2a94-4c0d-ad15-ca085bf8b71e');


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: veramo
--

SELECT pg_catalog.setval('public.migrations_id_seq', 5, true);


--
-- Name: customers PK_0d6a9c16d0c9bacffc0a784a186; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "PK_0d6a9c16d0c9bacffc0a784a186" PRIMARY KEY ("customerId");


--
-- Name: message_credentials_credential PK_1f64a9d131c0f7245a90deee93f; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message_credentials_credential
    ADD CONSTRAINT "PK_1f64a9d131c0f7245a90deee93f" PRIMARY KEY ("messageId", "credentialHash");


--
-- Name: presentation_credentials_credential PK_32d9cee791ee1139f29fd94b5c4; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation_credentials_credential
    ADD CONSTRAINT "PK_32d9cee791ee1139f29fd94b5c4" PRIMARY KEY ("presentationHash", "credentialHash");


--
-- Name: credential PK_32ea339ef30d340caac7961bd44; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.credential
    ADD CONSTRAINT "PK_32ea339ef30d340caac7961bd44" PRIMARY KEY (hash);


--
-- Name: service PK_85a21558c006647cd76fdce044b; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.service
    ADD CONSTRAINT "PK_85a21558c006647cd76fdce044b" PRIMARY KEY (id);


--
-- Name: presentation PK_8731bc1d6170def561c4820364b; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation
    ADD CONSTRAINT "PK_8731bc1d6170def561c4820364b" PRIMARY KEY (hash);


--
-- Name: private-key PK_87ac66202b01336a9df721d4ed8; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."private-key"
    ADD CONSTRAINT "PK_87ac66202b01336a9df721d4ed8" PRIMARY KEY (alias);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: key PK_9bda40833be3c080825245b1a11; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.key
    ADD CONSTRAINT "PK_9bda40833be3c080825245b1a11" PRIMARY KEY (kid);


--
-- Name: message_presentations_presentation PK_9dc4cc025ec7163ec5ca919d140; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message_presentations_presentation
    ADD CONSTRAINT "PK_9dc4cc025ec7163ec5ca919d140" PRIMARY KEY ("messageId", "presentationHash");


--
-- Name: identifier PK_a1ec7926e246e12a63e377e592e; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.identifier
    ADD CONSTRAINT "PK_a1ec7926e246e12a63e377e592e" PRIMARY KEY (did);


--
-- Name: message PK_ba01f0a3e0123651915008bc578; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT "PK_ba01f0a3e0123651915008bc578" PRIMARY KEY (id);


--
-- Name: presentation_verifier_identifier PK_c3b760612b992bc75511d74f6a9; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation_verifier_identifier
    ADD CONSTRAINT "PK_c3b760612b992bc75511d74f6a9" PRIMARY KEY ("presentationHash", "identifierDid");


--
-- Name: claim PK_d8d95bd745ab41510c724a43c36; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.claim
    ADD CONSTRAINT "PK_d8d95bd745ab41510c724a43c36" PRIMARY KEY (hash);


--
-- Name: IDX_1f64a9d131c0f7245a90deee93; Type: INDEX; Schema: public; Owner: veramo
--

CREATE INDEX "IDX_1f64a9d131c0f7245a90deee93" ON public.message_credentials_credential USING btree ("messageId", "credentialHash");


--
-- Name: IDX_32d9cee791ee1139f29fd94b5c; Type: INDEX; Schema: public; Owner: veramo
--

CREATE INDEX "IDX_32d9cee791ee1139f29fd94b5c" ON public.presentation_credentials_credential USING btree ("presentationHash", "credentialHash");


--
-- Name: IDX_6098cca69c838d91e55ef32fe1; Type: INDEX; Schema: public; Owner: veramo
--

CREATE UNIQUE INDEX "IDX_6098cca69c838d91e55ef32fe1" ON public.identifier USING btree (alias, provider);


--
-- Name: IDX_9dc4cc025ec7163ec5ca919d14; Type: INDEX; Schema: public; Owner: veramo
--

CREATE INDEX "IDX_9dc4cc025ec7163ec5ca919d14" ON public.message_presentations_presentation USING btree ("messageId", "presentationHash");


--
-- Name: IDX_c3b760612b992bc75511d74f6a; Type: INDEX; Schema: public; Owner: veramo
--

CREATE INDEX "IDX_c3b760612b992bc75511d74f6a" ON public.presentation_verifier_identifier USING btree ("presentationHash", "identifierDid");


--
-- Name: presentation_verifier_identifier FK_05b1eda0f6f5400cb173ebbc086; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation_verifier_identifier
    ADD CONSTRAINT "FK_05b1eda0f6f5400cb173ebbc086" FOREIGN KEY ("presentationHash") REFERENCES public.presentation(hash) ON DELETE CASCADE;


--
-- Name: credential FK_123d0977e0976565ee0932c0b9e; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.credential
    ADD CONSTRAINT "FK_123d0977e0976565ee0932c0b9e" FOREIGN KEY ("issuerDid") REFERENCES public.identifier(did) ON DELETE CASCADE;


--
-- Name: message FK_1a666b2c29bb2b68d91259f55df; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT "FK_1a666b2c29bb2b68d91259f55df" FOREIGN KEY ("toDid") REFERENCES public.identifier(did);


--
-- Name: message_credentials_credential FK_1c111357e73db91a08525914b59; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message_credentials_credential
    ADD CONSTRAINT "FK_1c111357e73db91a08525914b59" FOREIGN KEY ("messageId") REFERENCES public.message(id) ON DELETE CASCADE;


--
-- Name: presentation_verifier_identifier FK_3a460e48557bad5564504ddad90; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation_verifier_identifier
    ADD CONSTRAINT "FK_3a460e48557bad5564504ddad90" FOREIGN KEY ("identifierDid") REFERENCES public.identifier(did) ON DELETE CASCADE;


--
-- Name: claim FK_3d494b79143de3d0e793883e351; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.claim
    ADD CONSTRAINT "FK_3d494b79143de3d0e793883e351" FOREIGN KEY ("credentialHash") REFERENCES public.credential(hash) ON DELETE CASCADE;


--
-- Name: message FK_63bf73143b285c727bd046e6710; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT "FK_63bf73143b285c727bd046e6710" FOREIGN KEY ("fromDid") REFERENCES public.identifier(did);


--
-- Name: message_presentations_presentation FK_7e7094f2cd6e5ec93914ac5138f; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message_presentations_presentation
    ADD CONSTRAINT "FK_7e7094f2cd6e5ec93914ac5138f" FOREIGN KEY ("messageId") REFERENCES public.message(id) ON DELETE CASCADE;


--
-- Name: message_credentials_credential FK_8ae8195a94b667b185d2c023e33; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message_credentials_credential
    ADD CONSTRAINT "FK_8ae8195a94b667b185d2c023e33" FOREIGN KEY ("credentialHash") REFERENCES public.credential(hash) ON DELETE CASCADE;


--
-- Name: message_presentations_presentation FK_a13b5cf828c669e61faf489c182; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.message_presentations_presentation
    ADD CONSTRAINT "FK_a13b5cf828c669e61faf489c182" FOREIGN KEY ("presentationHash") REFERENCES public.presentation(hash) ON DELETE CASCADE;


--
-- Name: presentation FK_a5e418449d9f527776a3bd0ca61; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation
    ADD CONSTRAINT "FK_a5e418449d9f527776a3bd0ca61" FOREIGN KEY ("holderDid") REFERENCES public.identifier(did) ON DELETE CASCADE;


--
-- Name: credential FK_b790831f44e2fa7f9661a017b0a; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.credential
    ADD CONSTRAINT "FK_b790831f44e2fa7f9661a017b0a" FOREIGN KEY ("subjectDid") REFERENCES public.identifier(did);


--
-- Name: presentation_credentials_credential FK_d796bcde5e182136266b2a6b72c; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation_credentials_credential
    ADD CONSTRAINT "FK_d796bcde5e182136266b2a6b72c" FOREIGN KEY ("presentationHash") REFERENCES public.presentation(hash) ON DELETE CASCADE;


--
-- Name: claim FK_d972c73d0f875c0d14c35b33baa; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.claim
    ADD CONSTRAINT "FK_d972c73d0f875c0d14c35b33baa" FOREIGN KEY ("issuerDid") REFERENCES public.identifier(did) ON DELETE CASCADE;


--
-- Name: presentation_credentials_credential FK_ef88f92988763fee884c37db63b; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation_credentials_credential
    ADD CONSTRAINT "FK_ef88f92988763fee884c37db63b" FOREIGN KEY ("credentialHash") REFERENCES public.credential(hash) ON DELETE CASCADE;


--
-- Name: claim FK_f411679379d373424100a1c73f4; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.claim
    ADD CONSTRAINT "FK_f411679379d373424100a1c73f4" FOREIGN KEY ("subjectDid") REFERENCES public.identifier(did);


--
-- PostgreSQL database dump complete
--

