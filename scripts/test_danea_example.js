const norm = require('../receipt-normalizer');

const sample = `Arredufficio Srl
Via Crissolo, 12 - 10138  Torino  (TO) - Italy
Tel. 011-2568745   Fax 011-2548793
e-mail: arredufficiosrl@arredufficio.it   Internet: www.arreduffici
C.F./P.Iva 01303760282

Destinatario
Vendita al banco

nr.    2      del
                 26/07/2026

Codice Descrizione                   QuantitP
                                                  àrezzo ivatoSconto Importo
0027   Carrello "Trasporto"  portata max 121
                                                0 pKzg  € 83,00        € 83,00
0026   Carrello ribaltabile tramite comando1
                                                 ap zpied
                                                       €e
                                                         .
                                                         3 
                                                          1P
                                                           ,o
                                                            0r
                                                             0tata    € 31,00
            max 150 Kg

            ( Documento creato con Danea Easyfatt in versione
            dimostrativa  - www.danea.it )

                                                  Tot. documento     € 114,00

Pag1.`;

const res = norm.normalize(sample);
console.log(JSON.stringify(res, null, 2));
