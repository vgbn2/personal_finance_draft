/*
 * Filename: C02031.c
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

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int s = 65 + n - 2;
    int dem = n;
    for (int i = n; i >= 2; i--)
    {
        int d = s;
        for (int j = 1; j <= dem; j++)
        {
            printf("%c", d); // Print result
            d++;
        }
        dem--;
        s--;
        printf("\n"); // Print result
    }
    printf("@"); // Print result
    return 0;
}