/*
 * Filename: C02025.c
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
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    printf("@"); // Print result
    int s = 65;
    for (int j = 2; j <= b; j++)
    {
        printf("%c", s); // Print result
        s++;
    }
    printf("\n"); // Print result
    s = 65;
    for (int i = 2; i <= a; i++)
    {
        int d = s;
        for (int j = 1; j <= b; j++)
        {
            if (d >= 65 + (b - 2))
            {
                printf("%c", d); // Print result
            }
            else
            {
                printf("%c", d); // Print result
                d++;
            }
        }
        printf("\n"); // Print result
        if (s < 65 + (b - 2))
            s++;
    }
    return 0;
}