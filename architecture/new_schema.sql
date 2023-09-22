--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Debian 15.1-1.pgdg110+1)
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
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: categoryenum; Type: TYPE; Schema: public; Owner: veramo
--

CREATE TYPE public.categoryenum AS ENUM (
    'did',
    'resource',
    'credential-status'
);


ALTER TYPE public.categoryenum OWNER TO veramo;

--
-- Name: namespace; Type: TYPE; Schema: public; Owner: veramo
--

CREATE TYPE public.namespace AS ENUM (
    'testnet',
    'mainnet'
);


ALTER TYPE public.namespace OWNER TO veramo;

--
-- Name: namespaceenum; Type: TYPE; Schema: public; Owner: veramo
--

CREATE TYPE public.namespaceenum AS ENUM (
    'testnet',
    'mainnet'
);


ALTER TYPE public.namespaceenum OWNER TO veramo;

--
-- Name: networkenum; Type: TYPE; Schema: public; Owner: veramo
--

CREATE TYPE public.networkenum AS ENUM (
    'testnet',
    'mainnet'
);


ALTER TYPE public.networkenum OWNER TO veramo;

--
-- Name: operationenum; Type: TYPE; Schema: public; Owner: veramo
--

CREATE TYPE public.operationenum AS ENUM (
    'create',
    'update',
    'revoke',
    'suspend',
    'deactivate',
    'reinstate'
);


ALTER TYPE public.operationenum OWNER TO veramo;

--
-- Name: paymentdirectionenum; Type: TYPE; Schema: public; Owner: veramo
--

CREATE TYPE public.paymentdirectionenum AS ENUM (
    'inbound',
    'outbound'
);


ALTER TYPE public.paymentdirectionenum OWNER TO veramo;

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
    "credentialHash" character varying NOT NULL,
    "customerId" uuid
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
-- Name: customer; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.customer (
    "customerId" uuid NOT NULL,
    name character varying,
    "createdAt" date NOT NULL,
    "updatedAt" date
);


ALTER TABLE public.customer OWNER TO veramo;

--
-- Name: identifier; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.identifier (
    did character varying NOT NULL,
    provider character varying,
    alias character varying,
    "saveDate" timestamp without time zone NOT NULL,
    "updateDate" timestamp without time zone NOT NULL,
    "controllerKeyId" character varying,
    "customerId" uuid
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
    "identifierDid" character varying,
    "publicKeyAlias" character varying,
    "customerId" uuid,
    "createdAt" date,
    "updatedAt" date
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
-- Name: operation; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.operation (
    "operationId" uuid NOT NULL,
    category public.categoryenum NOT NULL,
    "operationName" character varying NOT NULL,
    "defaultFee" bigint,
    deprecated boolean DEFAULT false NOT NULL,
    "createdAt" date NOT NULL,
    "updatedAt" date
);


ALTER TABLE public.operation OWNER TO veramo;

--
-- Name: payment; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.payment (
    "txHash" character varying NOT NULL,
    "customerId" uuid NOT NULL,
    direction public.paymentdirectionenum NOT NULL,
    fee bigint,
    "identifierDid" character varying,
    "resourceId" uuid,
    "paymentAddress" character varying NOT NULL,
    "operationId" uuid NOT NULL,
    "timestamp" date
);


ALTER TABLE public.payment OWNER TO veramo;

--
-- Name: paymentAccount; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public."paymentAccount" (
    namespace public.namespaceenum DEFAULT 'testnet'::public.namespaceenum NOT NULL,
    "customerId" uuid NOT NULL,
    kid character varying NOT NULL,
    "createdAt" date NOT NULL,
    address character varying NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "updatedAt" date
);


ALTER TABLE public."paymentAccount" OWNER TO veramo;

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
    "holderDid" character varying,
    "customerId" uuid
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
-- Name: resource; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.resource (
    "resourceId" uuid NOT NULL,
    "identifierDid" character varying NOT NULL,
    kid character varying NOT NULL,
    "resourceName" character varying NOT NULL,
    "resourceType" character varying,
    "mediaType" character varying NOT NULL,
    "previousVersionId" uuid,
    "createdAt" date NOT NULL,
    "nextVersionId" uuid,
    "customerId" uuid NOT NULL,
    "updatedAt" date
);


ALTER TABLE public.resource OWNER TO veramo;

--
-- Name: role; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public.role (
    "roleTypeId" uuid NOT NULL,
    name character varying NOT NULL,
    "LogToRoleIds" character varying[] NOT NULL
);


ALTER TABLE public.role OWNER TO veramo;

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
-- Name: symmetricKey; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public."symmetricKey" (
    id uuid NOT NULL,
    "customerId" uuid NOT NULL,
    "identifierDid" character varying NOT NULL,
    "resourceId" uuid NOT NULL,
    "resourceName" character varying,
    "resourceType" character varying,
    "symmetricKey" character varying NOT NULL
);


ALTER TABLE public."symmetricKey" OWNER TO veramo;

--
-- Name: user; Type: TABLE; Schema: public; Owner: veramo
--

CREATE TABLE public."user" (
    "logtoId" character varying NOT NULL,
    "customerId" uuid NOT NULL,
    "createdAt" date NOT NULL,
    "roleTypeId" uuid,
    "updatedAt" date
);


ALTER TABLE public."user" OWNER TO veramo;

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
-- Data for Name: customer; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public.customer ("customerId", name, "createdAt", "updatedAt") VALUES ('dffb307f-2e61-4e4b-ac64-167ed993800c', 'Sergey', '2023-09-13', NULL);


--
-- Data for Name: identifier; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: key; Type: TABLE DATA; Schema: public; Owner: veramo
--

INSERT INTO public.key (kid, kms, type, "publicKeyHex", meta, "identifierDid", "publicKeyAlias", "customerId", "createdAt", "updatedAt") VALUES ('05a0b0b2df2278ec5910042f6bf5fe7ee9009102b9c6dab5d43745e96a14f5f66ff96b9a654793cb95895eef700f0903f030966802b48247294abe3c583dd221b0', 'postgres', 'Ed25519', '05a0b0b2df2278ec5910042f6bf5fe7ee9009102b9c6dab5d43745e96a14f5f66ff96b9a654793cb95895eef700f0903f030966802b48247294abe3c583dd221b0', '{"algorithms":["ES256K","ES256K-R","eth_signTransaction","eth_signTypedData","eth_signMessage","eth_rawSign"]}', NULL, 'SergeyKey', 'dffb307f-2e61-4e4b-ac64-167ed993800c', '2023-09-13', NULL);


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



--
-- Data for Name: operation; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: payment; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: paymentAccount; Type: TABLE DATA; Schema: public; Owner: veramo
--



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



--
-- Data for Name: resource; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: role; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: service; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: symmetricKey; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: veramo
--



--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: veramo
--

SELECT pg_catalog.setval('public.migrations_id_seq', 5, true);


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
-- Name: customer customers_customerId_key; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT "customers_customerId_key" UNIQUE ("customerId");


--
-- Name: operation operation_pk; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.operation
    ADD CONSTRAINT operation_pk PRIMARY KEY ("operationId");


--
-- Name: paymentAccount paymentAccount_pk; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."paymentAccount"
    ADD CONSTRAINT "paymentAccount_pk" PRIMARY KEY (address);


--
-- Name: payment payment_pk; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pk PRIMARY KEY ("txHash");


--
-- Name: resource resource_pk; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_pk PRIMARY KEY ("resourceId");


--
-- Name: role role_pk; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pk PRIMARY KEY ("roleTypeId");


--
-- Name: symmetricKey symmetricKey_pk; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."symmetricKey"
    ADD CONSTRAINT "symmetricKey_pk" PRIMARY KEY (id);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY ("logtoId");


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
-- Name: identifier FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.identifier
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: claim FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.claim
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: key FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.key
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: presentation FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.presentation
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: resource FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: user FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: paymentAccount FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."paymentAccount"
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId") ON DELETE CASCADE;


--
-- Name: payment FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: symmetricKey FKCustomerId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."symmetricKey"
    ADD CONSTRAINT "FKCustomerId" FOREIGN KEY ("customerId") REFERENCES public.customer("customerId");


--
-- Name: payment FKIdentifier; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "FKIdentifier" FOREIGN KEY ("identifierDid") REFERENCES public.identifier(did);


--
-- Name: resource FKIdentifierDid; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT "FKIdentifierDid" FOREIGN KEY ("identifierDid") REFERENCES public.identifier(did);


--
-- Name: symmetricKey FKIdentifierDid; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."symmetricKey"
    ADD CONSTRAINT "FKIdentifierDid" FOREIGN KEY ("identifierDid") REFERENCES public.identifier(did);


--
-- Name: resource FKKeyId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT "FKKeyId" FOREIGN KEY (kid) REFERENCES public.key(kid);


--
-- Name: paymentAccount FKKid; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."paymentAccount"
    ADD CONSTRAINT "FKKid" FOREIGN KEY (kid) REFERENCES public.key(kid);


--
-- Name: payment FKOperationId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "FKOperationId" FOREIGN KEY ("operationId") REFERENCES public.operation("operationId");


--
-- Name: payment FKPaymentAccount; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "FKPaymentAccount" FOREIGN KEY ("paymentAddress") REFERENCES public."paymentAccount"(address);


--
-- Name: symmetricKey FKPrivateKey; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."symmetricKey"
    ADD CONSTRAINT "FKPrivateKey" FOREIGN KEY ("symmetricKey") REFERENCES public."private-key"(alias);


--
-- Name: payment FKResourceId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT "FKResourceId" FOREIGN KEY ("resourceId") REFERENCES public.resource("resourceId");


--
-- Name: symmetricKey FKResourceId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."symmetricKey"
    ADD CONSTRAINT "FKResourceId" FOREIGN KEY ("resourceId") REFERENCES public.resource("resourceId");


--
-- Name: user FKRoleTypeId; Type: FK CONSTRAINT; Schema: public; Owner: veramo
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "FKRoleTypeId" FOREIGN KEY ("roleTypeId") REFERENCES public.role("roleTypeId");


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

