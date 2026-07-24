const normalizer = require('../receipt-normalizer');

const sample = `Arredufficio Srl
                Via Crissolo, 12 - 10138  Torino  (TO) - Italy
                Tel. 011-2568745   Fax 011-2548793
                e-mail: arredufficiosrl@arredufficio.it   Internet: www.arreduffici
                C.F./P.Iva 01303760282

                                          Destinatario
     Vendita al banco

     nr.    2      del
                      24/07/2026

     Codice Descrizione                   QuantitP
                                                  àrezzo ivatoSconto Importo
     0029   Bancone Receptions 150 cm Linea "Arc1
                                                adpiza"€ 209,00       € 209,00
     0028   Bancone Receptions 80 cm Linea "Arca1
                                                dipaz" € 112,00       € 112,00
     0030   Bancone Receptions Angolare 90 ° Lin1
                                                eap z"Ar
                                                      €c
                                                        a
                                                        4d
                                                         1i
                                                          1a
                                                           ,"
                                                            00       € 411,00

            ( Documento creato con Danea Easyfatt in versione
            dimostrativa  - www.danea.it )

                                                  Tot. documento     € 732,00

     Pag1.`;

const result = normalizer.normalize(sample);
console.log(JSON.stringify(result, null, 2));
