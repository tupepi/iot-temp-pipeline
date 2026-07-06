import { motion } from 'framer-motion'; // Tuodaan animaatiokirjasto

interface CardProps {
  children: React.ReactNode; // Sisältö, joka annetaan kortin sisälle
  delay?: number; // Valinnainen animaatioviive (oletuksena 0)
  className?: string; // Valinnainen lisätyyli, jos joku kortti tarvitsee poikkeavan tyylin
}

function Card({ children, delay = 0, className = 'p-6' }: CardProps) { // Uudelleenkäytettävä korttikomponentti sisääntuloanimaatiolla
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow mb-4 ${className}`}
    >
      {children}
    </motion.div>
  );
}

export default Card; // Viedään komponentti muiden käytettäväksi
