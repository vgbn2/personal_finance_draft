/*
 * Filename: C02028.c
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
    int dem = n;
    int a = 65;
    for (int i = 1; i <= n; i++)
    {
        int b = a;
        for (int j = 1; j <= dem; j++)
        {
            printf("%c", b); // Print result
            b += 2;
        }
        printf("\n"); // Print result
        dem--;
        a += 2;
    }
}