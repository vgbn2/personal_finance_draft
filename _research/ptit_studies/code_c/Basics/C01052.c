/*
 * Filename: C01052.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        int n;
        scanf("%d", &n); // Read input
        int dem = 0;
        for (int i = 1; i <= sqrt(n); i++)
        {
            if (n % i == 0)
            {
                if (i % 2 == 0)
                    dem++;
                if ((n / i) % 2 == 0)
                    dem++;
                if (i * i == n && i % 2 == 0)
                    dem = dem - 1;
            }
        }
        printf("%d\n", dem); // Print result
    }
    return 0;
}